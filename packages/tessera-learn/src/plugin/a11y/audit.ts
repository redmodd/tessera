import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
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

export interface AxeNodeDetail {
  target: string;
  html: string;
  summary: string;
}

interface AxeViolation {
  id: string;
  impact: ImpactLevel | null;
  help: string;
  helpUrl: string;
  nodes: number;
  elements: AxeNodeDetail[];
}

interface PageAuditResult {
  index: number;
  title: string;
  violations: AxeViolation[];
  loadFailed?: boolean;
}

interface AuditReport {
  standard: A11ySettings['standard'];
  threshold: ImpactLevel;
  pages: PageAuditResult[];
  pagesAudited: number;
  totalPages: number;
  pagesFailedToLoad: number;
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

const MAX_HTML_LENGTH = 200;
const MAX_ELEMENTS_SHOWN = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNodeDetail(node: any): AxeNodeDetail {
  const target = Array.isArray(node?.target)
    ? node.target.flat(Infinity).join(' ')
    : String(node?.target ?? '');
  const html = String(node?.html ?? '');
  return {
    target,
    html:
      html.length > MAX_HTML_LENGTH
        ? `${html.slice(0, MAX_HTML_LENGTH - 1)}…`
        : html,
    summary: String(node?.failureSummary ?? '')
      .replace(/\s*\n\s*/g, ' ')
      .trim(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapViolation(v: any): AxeViolation {
  return {
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    elements: v.nodes.map(mapNodeDetail),
  };
}

export function isMissingBrowserError(message: string): boolean {
  return /Executable doesn't exist|playwright install/i.test(message);
}

const INSTALL_CHROMIUM = 'pnpm exec playwright install chromium';

type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'exit', listener: (code: number | null) => void): unknown;
};

function resolvePlaywrightBin():
  | { command: string; args: string[] }
  | undefined {
  const require = createRequire(import.meta.url);
  for (const spec of ['playwright', '@playwright/test']) {
    try {
      const pkgPath = require.resolve(`${spec}/package.json`);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        bin?: string | Record<string, string>;
      };
      const binRel =
        typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.playwright;
      if (!binRel) continue;
      return {
        command: process.execPath,
        args: [resolve(dirname(pkgPath), binRel), 'install', 'chromium'],
      };
    } catch {
      continue;
    }
  }
  return undefined;
}

// Run the workspace's own `playwright` bin with the current Node binary so the
// install is package-manager-agnostic. No --with-deps: it needs sudo on Linux.
export async function installChromium(
  workspaceRoot: string,
  spawnFn: SpawnFn = spawn,
): Promise<boolean> {
  const bin = resolvePlaywrightBin();
  if (!bin) {
    console.error(
      `\x1b[31m[tessera a11y]\x1b[0m Could not locate the Playwright CLI to install Chromium.`,
    );
    return false;
  }

  return new Promise<boolean>((resolvePromise) => {
    const child = spawnFn(bin.command, bin.args, {
      stdio: 'inherit',
      cwd: workspaceRoot,
    });
    child.on('error', (err) => {
      console.error(
        `\x1b[31m[tessera a11y]\x1b[0m Failed to start the Chromium install: ${err.message}`,
      );
      resolvePromise(false);
    });
    child.on('exit', (code) => resolvePromise(code === 0));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LaunchResult = { ok: true; browser: any } | { ok: false; code: number };

// Owns the catch → install → guarded-retry around chromium.launch(). The retry
// is guarded because a binary-only install can still fail to launch (on Linux,
// for want of system libs) rather than throw a raw error post-download.
export async function launchWithInstall({
  launch,
  install,
  isLinux = process.platform === 'linux',
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  launch: () => Promise<any>;
  install: () => Promise<boolean>;
  isLinux?: boolean;
}): Promise<LaunchResult> {
  try {
    return { ok: true, browser: await launch() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingBrowserError(message)) throw err;

    console.log(
      "[tessera a11y] Chromium isn't installed for Playwright. Installing it once now…",
    );
    const installed = await install();
    if (!installed) {
      console.error(
        `\x1b[31m[tessera a11y]\x1b[0m Chromium isn't installed for Playwright.\n` +
          `  Install it once:\n` +
          `    ${INSTALL_CHROMIUM}`,
      );
      return { ok: false, code: 1 };
    }

    try {
      return { ok: true, browser: await launch() };
    } catch (retryErr) {
      const retryMessage =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      if (isMissingBrowserError(retryMessage)) {
        console.error(
          `\x1b[31m[tessera a11y]\x1b[0m Chromium still isn't installed after the install step.\n` +
            `  Install it once:\n` +
            `    ${INSTALL_CHROMIUM}`,
        );
      } else {
        console.error(
          `\x1b[31m[tessera a11y]\x1b[0m Chromium installed but failed to launch.\n` +
            (isLinux
              ? `  Install system dependencies:\n    pnpm exec playwright install --with-deps chromium\n`
              : ``) +
            `  Original error: ${retryMessage}`,
        );
      }
      return { ok: false, code: 1 };
    }
  }
}

// A violation with no impact is treated as failing rather than slipping the
// gate at every threshold.
function isFailing(v: AxeViolation, thresholdRank: number): boolean {
  return !v.impact || IMPACT_RANK[v.impact] >= thresholdRank;
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
  workspaceRoot: string,
  options: AuditOptions = {},
): Promise<number> {
  const threshold: ImpactLevel = options.threshold ?? 'serious';

  const deps = await loadDeps();
  if (!deps.ok) {
    console.error(
      `\x1b[31m[tessera a11y]\x1b[0m Tier 2 needs Playwright + axe-core, which aren't installed.\n` +
        `  Install them to run the runtime audit:\n` +
        `    pnpm add -D playwright @axe-core/playwright\n` +
        `    ${INSTALL_CHROMIUM}`,
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
  const { resolveTesseraConfig } = await import('../inline-config.js');
  // Carries tesseraPlugin() + the Svelte compiler; without it the plugin-less
  // build would silently produce a broken bundle (there is no vite.config.js).
  const auditBaseConfig = await resolveTesseraConfig(
    projectRoot,
    workspaceRoot,
    {
      command: 'build',
      mode: 'production',
    },
  );

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
      await vite.build(
        vite.mergeConfig(auditBaseConfig, {
          build: { outDir: auditDist, emptyOutDir: true },
          logLevel: 'warn',
        }),
      );
    }

    server = await vite.preview({
      root: projectRoot,
      base: auditBaseConfig.base,
      build: { outDir: auditDist },
      preview: { port: 0, host: '127.0.0.1' },
      logLevel: 'warn',
    });
    const baseUrl: string | undefined = server.resolvedUrls?.local?.[0];
    if (!baseUrl) {
      console.error('[tessera a11y] Could not determine preview server URL.');
      return 1;
    }

    const launched = await launchWithInstall({
      launch: () => chromium.launch(),
      install: () => installChromium(workspaceRoot),
    });
    if (!launched.ok) return launched.code;
    const browser = launched.browser;
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
        return out.violations.map(mapViolation);
      };

      const recordPage = async (
        index: number,
        title: string,
      ): Promise<PageAuditResult> => {
        const loadFailed = await page.evaluate(
          () =>
            document.getElementById('tessera-app')?.dataset.tesseraPageError ===
            'true',
        );
        if (loadFailed) return { index, title, violations: [], loadFailed };
        return { index, title, violations: await scan() };
      };

      const totalPages = manifest.pages.length;
      const hasAuditHook = await page.evaluate(
        () => typeof window.__tesseraAudit?.goToIndex === 'function',
      );

      if (!hasAuditHook) {
        // No navigation hook — audit the entry only, but flag the reduced scope
        // rather than passing it off as full coverage.
        if (totalPages > 1) {
          console.warn(
            `\x1b[33m[tessera a11y]\x1b[0m Could not enumerate pages; auditing the entry page only ` +
              `(1 of ${totalPages}). The report records the reduced scope.`,
          );
        }
        pages.push(await recordPage(0, manifest.pages[0]?.title ?? '(entry)'));
      } else {
        for (let i = 0; i < totalPages; i++) {
          await page.evaluate(
            (idx: number) => window.__tesseraAudit!.goToIndex(idx),
            i,
          );
          await page.waitForFunction(
            (idx: number) =>
              document.getElementById('tessera-app')?.dataset
                .tesseraPageIndex === String(idx),
            i,
            { timeout: 20_000 },
          );
          await page.waitForLoadState('networkidle');
          pages.push(
            await recordPage(i, manifest.pages[i]?.title ?? `Page ${i + 1}`),
          );
        }
      }
    } finally {
      await browser.close();
    }

    const thresholdRank = IMPACT_RANK[threshold];
    let totalViolations = 0;
    let failingViolations = 0;
    let pagesFailedToLoad = 0;
    for (const p of pages) {
      if (p.loadFailed) pagesFailedToLoad++;
      for (const v of p.violations) {
        totalViolations++;
        if (isFailing(v, thresholdRank)) failingViolations++;
      }
    }

    const report: AuditReport = {
      standard: settings.standard,
      threshold,
      pages,
      pagesAudited: pages.length,
      totalPages: manifest.pages.length,
      pagesFailedToLoad,
      totalViolations,
      failingViolations,
      passed: failingViolations === 0 && pagesFailedToLoad === 0,
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
    if (p.loadFailed) {
      console.log(`\x1b[31m  ✗\x1b[0m ${p.title} — failed to load`);
      continue;
    }
    if (p.violations.length === 0) {
      console.log(`\x1b[32m  ✓\x1b[0m ${p.title}`);
      continue;
    }
    const failing = p.violations.some((v) => isFailing(v, thresholdRank));
    const mark = failing ? '\x1b[31m  ✗\x1b[0m' : '\x1b[33m  ⚠\x1b[0m';
    console.log(`${mark} ${p.title}`);
    for (const v of p.violations) {
      console.log(
        `      [${v.impact ?? 'n/a'}] ${v.id} — ${v.help} (${v.nodes} node${v.nodes === 1 ? '' : 's'})`,
      );
      for (const el of v.elements.slice(0, MAX_ELEMENTS_SHOWN)) {
        console.log(
          `\x1b[90m        → ${el.target || '(unknown element)'}\x1b[0m`,
        );
        if (el.summary) console.log(`\x1b[90m          ${el.summary}\x1b[0m`);
      }
      const hidden = v.elements.length - MAX_ELEMENTS_SHOWN;
      if (hidden > 0) {
        console.log(
          `\x1b[90m        … and ${hidden} more — see a11y-report.json\x1b[0m`,
        );
      }
    }
  }
  console.log(`\n[tessera a11y] Report written to ${reportPath}`);
  if (report.pagesAudited < report.totalPages) {
    console.log(
      `\x1b[33m[tessera a11y] Covered ${report.pagesAudited} of ${report.totalPages} page(s)\x1b[0m — reduced scope, the rest were not audited.`,
    );
  } else if (report.pagesFailedToLoad > 0) {
    const scanned = report.pagesAudited - report.pagesFailedToLoad;
    console.log(
      `[tessera a11y] Reached all ${report.totalPages} page(s); scanned ${scanned}, ${report.pagesFailedToLoad} failed to load.`,
    );
  } else {
    console.log(`[tessera a11y] Covered all ${report.totalPages} page(s).`);
  }
  if (report.passed) {
    console.log(
      `\x1b[32m[tessera a11y] Passed\x1b[0m — ${report.totalViolations} total finding(s), none at/above "${report.threshold}".`,
    );
  } else {
    const reasons: string[] = [];
    if (report.failingViolations > 0) {
      reasons.push(
        `${report.failingViolations} finding(s) at/above "${report.threshold}" (of ${report.totalViolations} total)`,
      );
    }
    if (report.pagesFailedToLoad > 0) {
      reasons.push(`${report.pagesFailedToLoad} page(s) failed to load`);
    }
    console.log(
      `\x1b[31m[tessera a11y] Failed\x1b[0m — ${reasons.join('; ')}.`,
    );
  }
}
