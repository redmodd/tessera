import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateManifest, readCourseConfig } from '../manifest.js';
import { normalizeA11y, type A11ySettings } from '../validation.js';

export interface AuditOptions {
  /** Minimum violation impact that fails the run (CI gate). Default 'serious'. */
  threshold?: ImpactLevel;
  /** Force a fresh `vite build` even if dist/ exists. */
  rebuild?: boolean;
}

export type ImpactLevel = 'minor' | 'moderate' | 'serious' | 'critical';

const IMPACT_RANK: Record<ImpactLevel, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
  critical: 4,
};

// Set by runAudit during its build/preview; the plugin forces the WebAdapter,
// skips export packaging, and stubs xAPI while it's set. See plugin/index.ts.
export const AUDIT_ENV_FLAG = 'TESSERA_A11Y_AUDIT';

interface AxeViolation {
  id: string;
  impact: ImpactLevel | null;
  help: string;
  helpUrl: string;
  nodes: number;
}

interface PageAuditResult {
  index: number;
  title: string;
  violations: AxeViolation[];
}

interface AuditReport {
  standard: A11ySettings['standard'];
  threshold: ImpactLevel;
  pages: PageAuditResult[];
  totalViolations: number;
  failingViolations: number;
  passed: boolean;
}

/** Map the `a11y.standard` enum to axe's cumulative `runOnly` tag list. */
export function axeTags(standard: A11ySettings['standard']): string[] {
  switch (standard) {
    case 'wcag2a':
      return ['wcag2a'];
    case 'wcag21aa':
      return ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
    case 'wcag2aa':
    default:
      return ['wcag2a', 'wcag2aa'];
  }
}

/** axe-applicable ignore entries: drop the Tier-1a/1b namespaces. */
export function axeIgnoreRules(ignore: string[]): string[] {
  return ignore.filter(
    (id) => !id.startsWith('tessera/') && !id.startsWith('a11y_'),
  );
}

// Optional deps loaded by variable specifier so tsc doesn't require them to be
// installed — Tier 2 is opt-in and the absence is handled with a clear message.
async function tryImport(specifier: string): Promise<unknown> {
  return import(specifier);
}

interface LoadedDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chromium: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AxeBuilder: any;
}

async function loadDeps(): Promise<
  { ok: true; deps: LoadedDeps } | { ok: false; missing: string }
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  for (const spec of ['playwright', '@playwright/test']) {
    try {
      const mod = (await tryImport(spec)) as { chromium?: unknown };
      if (mod.chromium) {
        chromium = mod.chromium;
        break;
      }
    } catch {
      // try the next specifier
    }
  }
  if (!chromium) return { ok: false, missing: 'playwright' };

  try {
    const mod = (await tryImport('@axe-core/playwright')) as {
      default?: unknown;
    };
    if (!mod.default) return { ok: false, missing: '@axe-core/playwright' };
    return { ok: true, deps: { chromium, AxeBuilder: mod.default } };
  } catch {
    return { ok: false, missing: '@axe-core/playwright' };
  }
}

/**
 * Run the Tier-2 runtime accessibility audit against a built course. Builds (or
 * reuses) dist/, serves it, drives Playwright + axe-core over each page, writes
 * a11y-report.json, and returns a process exit code (0 pass, 1 fail/error).
 */
export async function runAudit(
  projectRoot: string,
  options: AuditOptions = {},
): Promise<number> {
  const threshold: ImpactLevel = options.threshold ?? 'serious';

  const deps = await loadDeps();
  if (!deps.ok) {
    console.error(
      `\x1b[31m[tessera a11y]\x1b[0m Tier 2 needs Playwright + axe-core, which aren't installed.\n` +
        `  Install them to run the runtime audit:\n` +
        `    npm i -D playwright @axe-core/playwright\n` +
        `    npx playwright install chromium`,
    );
    return 1;
  }
  const { chromium, AxeBuilder } = deps.deps;

  const read = readCourseConfig(projectRoot);
  const settings = normalizeA11y(read.ok ? read.config.a11y : undefined);
  const tags = axeTags(settings.standard);
  const disableRules = axeIgnoreRules(settings.ignore);

  const manifest = generateManifest(resolve(projectRoot, 'pages'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vite = (await import('vite')) as any;

  // A throwaway web build, kept out of dist/ so a real LMS export is untouched.
  const auditDist = resolve(projectRoot, 'node_modules', '.tessera-a11y');
  const distHtml = resolve(auditDist, 'index.html');

  const prevEnv = process.env[AUDIT_ENV_FLAG];
  process.env[AUDIT_ENV_FLAG] = '1';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any;
  try {
    if (options.rebuild || !existsSync(distHtml)) {
      console.log('[tessera a11y] Building course…');
      await vite.build({
        root: projectRoot,
        build: { outDir: auditDist, emptyOutDir: true },
        logLevel: 'warn',
      });
    }

    server = await vite.preview({
      root: projectRoot,
      build: { outDir: auditDist },
      preview: { port: 0, host: '127.0.0.1' },
      logLevel: 'warn',
    });
    const baseUrl: string | undefined = server.resolvedUrls?.local?.[0];
    if (!baseUrl) {
      console.error('[tessera a11y] Could not determine preview server URL.');
      return 1;
    }

    const browser = await chromium.launch();
    const pages: PageAuditResult[] = [];
    try {
      // axe-core/playwright requires a page from an explicit context.
      const context = await browser.newContext();
      const page = await context.newPage();
      // ?__tessera_audit unlocks navigation so quiz-gated pages can be scanned.
      const auditUrl = new URL(baseUrl);
      auditUrl.searchParams.set('__tessera_audit', '1');
      await page.goto(auditUrl.href, { waitUntil: 'networkidle' });
      await page.waitForSelector('#tessera-app', { timeout: 20_000 });

      const scan = async (): Promise<AxeViolation[]> => {
        const builder = new AxeBuilder({ page }).withTags(tags);
        if (disableRules.length > 0) builder.disableRules(disableRules);
        const out = await builder.analyze();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return out.violations.map((v: any) => ({
          id: v.id,
          impact: v.impact ?? null,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length,
        }));
      };

      const navCount = await page.locator('button.tessera-nav-page').count();
      if (navCount === 0) {
        // No sidebar (custom chrome) — audit whatever is rendered at the entry.
        pages.push({
          index: 0,
          title: manifest.pages[0]?.title ?? '(entry)',
          violations: await scan(),
        });
      } else {
        for (let i = 0; i < navCount; i++) {
          const btn = page.locator('button.tessera-nav-page').nth(i);
          const title = (await btn.textContent())?.trim() || `Page ${i + 1}`;
          await btn.click();
          await page.waitForFunction(
            (idx: number) =>
              document
                .querySelectorAll('button.tessera-nav-page')
                [idx]?.getAttribute('aria-current') === 'page',
            i,
            { timeout: 20_000 },
          );
          await page.waitForLoadState('networkidle');
          pages.push({ index: i, title, violations: await scan() });
        }
      }
    } finally {
      await browser.close();
    }

    const thresholdRank = IMPACT_RANK[threshold];
    let totalViolations = 0;
    let failingViolations = 0;
    for (const p of pages) {
      for (const v of p.violations) {
        totalViolations++;
        // axe may report a violation with no impact; treat unknown severity as
        // failing rather than letting it slip the gate at every threshold.
        if (!v.impact || IMPACT_RANK[v.impact] >= thresholdRank)
          failingViolations++;
      }
    }

    const report: AuditReport = {
      standard: settings.standard,
      threshold,
      pages,
      totalViolations,
      failingViolations,
      passed: failingViolations === 0,
    };
    const reportPath = resolve(projectRoot, 'a11y-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    printSummary(report, reportPath);
    return report.passed ? 0 : 1;
  } catch (err) {
    console.error(
      `\x1b[31m[tessera a11y]\x1b[0m Audit could not complete: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  } finally {
    server?.httpServer?.close?.();
    if (prevEnv === undefined) delete process.env[AUDIT_ENV_FLAG];
    else process.env[AUDIT_ENV_FLAG] = prevEnv;
  }
}

function printSummary(report: AuditReport, reportPath: string): void {
  const thresholdRank = IMPACT_RANK[report.threshold];
  for (const p of report.pages) {
    if (p.violations.length === 0) {
      console.log(`\x1b[32m  ✓\x1b[0m ${p.title}`);
      continue;
    }
    const failing = p.violations.some(
      (v) => !v.impact || IMPACT_RANK[v.impact] >= thresholdRank,
    );
    const mark = failing ? '\x1b[31m  ✗\x1b[0m' : '\x1b[33m  ⚠\x1b[0m';
    console.log(`${mark} ${p.title}`);
    for (const v of p.violations) {
      console.log(
        `      [${v.impact ?? 'n/a'}] ${v.id} — ${v.help} (${v.nodes} node${v.nodes === 1 ? '' : 's'})`,
      );
    }
  }
  console.log(`\n[tessera a11y] Report written to ${reportPath}`);
  if (report.passed) {
    console.log(
      `\x1b[32m[tessera a11y] Passed\x1b[0m — ${report.totalViolations} total finding(s), none at/above "${report.threshold}".`,
    );
  } else {
    console.log(
      `\x1b[31m[tessera a11y] Failed\x1b[0m — ${report.failingViolations} finding(s) at/above "${report.threshold}" (of ${report.totalViolations} total).`,
    );
  }
}
