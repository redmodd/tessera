import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { styleText } from 'node:util';
import { styleErr } from '../cli-args.js';
import type { Plugin, PreviewServer } from 'vite';
import type { ContextPluginApi } from '../build-context.js';
import { a11ySettingsFrom, type A11ySettings } from '../validation/a11y.js';
import { errorMessage } from '../../runtime/errors.js';

export interface AuditOptions {
  /** Minimum violation impact that fails the run (CI gate). Default 'serious'. */
  threshold?: ImpactLevel;
}

export const IMPACT_LEVELS = [
  'minor',
  'moderate',
  'serious',
  'critical',
] as const;

export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

// Set by runAudit during its build/preview; the plugin forces the WebAdapter,
// skips export packaging, and stubs xAPI while it's set. See plugin/index.ts.
export const AUDIT_ENV_FLAG = 'TESSERA_A11Y_AUDIT';

interface AxeNodeDetail {
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

// axe files a label on a role-less element under `incomplete` when the element
// has text, but screen readers still drop the label.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function auditFindings(out: { violations: any[]; incomplete: any[] }) {
  return [
    ...out.violations,
    ...out.incomplete.filter((r) => r.id === 'aria-prohibited-attr'),
  ];
}

// A node inside a cross-origin frame is a third-party embed's markup (Video's
// YouTube or Vimeo player) that the author can't fix. The <iframe> stays checked.
async function dropCrossOriginNodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: any[],
  courseOrigin: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const verdicts = new Map<string, Promise<boolean>>();
  const inCrossOriginFrame = (
    frames: (string | string[])[],
  ): Promise<boolean> => {
    const key = JSON.stringify(frames);
    if (!verdicts.has(key)) {
      verdicts.set(
        key,
        crossesOrigin(page.mainFrame(), frames, courseOrigin).catch(
          () => false,
        ),
      );
    }
    return verdicts.get(key)!;
  };
  const kept = await Promise.all(
    results.map(async (r) => {
      const cross = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r.nodes.map((n: any) => inCrossOriginFrame(n.target.slice(0, -1))),
      );
      return {
        ...r,
        nodes: r.nodes.filter((_: unknown, i: number) => !cross[i]),
      };
    }),
  );
  return kept.filter((r) => r.nodes.length > 0);
}

async function crossesOrigin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frame: any,
  selectors: (string | string[])[],
  courseOrigin: string,
): Promise<boolean> {
  for (const selector of selectors) {
    // A selector array walks into shadow roots.
    const iframe = await frame.evaluateHandle((s: string | string[]) => {
      const [host, ...shadow] = [s].flat();
      let el = document.querySelector(host);
      for (const inner of shadow) {
        el = el?.shadowRoot?.querySelector(inner) ?? null;
      }
      return el;
    }, selector);
    frame = await iframe.asElement()?.contentFrame();
    await iframe.dispose();
    if (!frame) return false;
    if (isCrossOrigin(frame.url(), courseOrigin)) return true;
  }
  return false;
}

// An about: or data: frame holds the course's markup even when sandboxed;
// Chrome's error page for a failed embed (chrome-error:) does not.
function isCrossOrigin(href: string, courseOrigin: string): boolean {
  const url = URL.parse(href);
  if (!url || url.protocol === 'about:' || url.protocol === 'data:') {
    return false;
  }
  return url.origin !== courseOrigin;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function underCrossOrigin(frame: any, courseOrigin: string): boolean {
  for (; frame; frame = frame.parentFrame()) {
    if (isCrossOrigin(frame.url(), courseOrigin)) return true;
  }
  return false;
}

export function isMissingBrowserError(message: string): boolean {
  return /Executable doesn't exist|playwright install/i.test(message);
}

// A missing-deps failure also mentions `playwright install-deps`, so it matches
// isMissingBrowserError; detect it first to route to the `--with-deps` fix.
export function isMissingDepsError(message: string): boolean {
  return /Host system is missing dependencies|missing dependencies to run browser/i.test(
    message,
  );
}

const INSTALL_CHROMIUM = 'pnpm exec playwright install chromium';
const PLAYWRIGHT_SPECS = ['playwright', '@playwright/test'] as const;

function stderrTag(color: 'red' | 'yellow' = 'red'): string {
  return styleErr(color, '[tessera a11y]');
}

function reportManualInstall(lead: string): void {
  console.error(
    `${stderrTag()} ${lead}\n` +
      `  Install it once:\n` +
      `    ${INSTALL_CHROMIUM}`,
  );
}

function resolvePlaywrightBin():
  { command: string; args: string[] } | undefined {
  const require = createRequire(import.meta.url);
  for (const spec of PLAYWRIGHT_SPECS) {
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

const INSTALL_TIMEOUT_MS = 10 * 60_000;

// Run the workspace's own `playwright` bin with the current Node binary so the
// install is package-manager-agnostic. No --with-deps: it needs sudo on Linux.
export async function installChromium(workspaceRoot: string): Promise<boolean> {
  const bin = resolvePlaywrightBin();
  if (!bin) {
    console.error(
      `${stderrTag()} Could not locate the Playwright CLI to install Chromium.`,
    );
    return false;
  }

  const child = spawn(bin.command, bin.args, {
    stdio: 'inherit',
    cwd: workspaceRoot,
    timeout: INSTALL_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  try {
    const [code] = await once(child, 'exit');
    // Only spawn's timeout kills the child, so `killed` means it timed out.
    if (child.killed) {
      console.error(
        `${stderrTag()} Chromium install timed out after ${INSTALL_TIMEOUT_MS / 60_000} min; aborting.`,
      );
      return false;
    }
    return code === 0;
  } catch (err) {
    console.error(
      `${stderrTag()} Failed to start the Chromium install: ${errorMessage(err)}`,
    );
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LaunchResult = { ok: true; browser: any } | { ok: false; code: number };

function reportLaunchFailure(message: string, isLinux: boolean): void {
  console.error(
    `${stderrTag()} Chromium is installed but failed to launch.\n` +
      (isLinux
        ? `  Install system dependencies:\n    pnpm exec playwright install --with-deps chromium\n`
        : ``) +
      `  Original error: ${message}`,
  );
}

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
    const message = errorMessage(err);
    if (isMissingDepsError(message)) {
      reportLaunchFailure(message, isLinux);
      return { ok: false, code: 1 };
    }
    if (!isMissingBrowserError(message)) throw err;

    console.log(
      "[tessera a11y] Chromium isn't installed for Playwright. Installing it once now…",
    );
    const installed = await install();
    if (!installed) {
      reportManualInstall("Chromium isn't installed for Playwright.");
      return { ok: false, code: 1 };
    }

    try {
      return { ok: true, browser: await launch() };
    } catch (retryErr) {
      const retryMessage = errorMessage(retryErr);
      if (
        isMissingBrowserError(retryMessage) &&
        !isMissingDepsError(retryMessage)
      ) {
        reportManualInstall(
          "Chromium still isn't installed after the install step.",
        );
      } else {
        reportLaunchFailure(retryMessage, isLinux);
      }
      return { ok: false, code: 1 };
    }
  }
}

// A violation with no impact is treated as failing rather than slipping the
// gate at every threshold.
function isFailing(v: AxeViolation, thresholdRank: number): boolean {
  return !v.impact || IMPACT_LEVELS.indexOf(v.impact) >= thresholdRank;
}

// Optional deps loaded by variable specifier so tsc doesn't require them to be
// installed; Tier 2 is opt-in and the absence is handled with a clear message.
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
  for (const spec of PLAYWRIGHT_SPECS) {
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
      `${stderrTag()} Tier 2 needs Playwright + axe-core, which aren't installed.\n` +
        `  Install them to run the runtime audit:\n` +
        `    pnpm add -D playwright @axe-core/playwright\n` +
        `    ${INSTALL_CHROMIUM}`,
    );
    return 1;
  }
  const { chromium, AxeBuilder } = deps.deps;

  const vite = await import('vite');
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

  const prevEnv = process.env[AUDIT_ENV_FLAG];
  process.env[AUDIT_ENV_FLAG] = '1';

  let server: PreviewServer | undefined;
  let contextApi: ContextPluginApi | undefined;
  try {
    console.log('[tessera a11y] Building course…');
    await vite.build(
      vite.mergeConfig(auditBaseConfig, {
        build: { outDir: auditDist, emptyOutDir: true },
        logLevel: 'warn',
        plugins: [
          {
            name: 'tessera:a11y-context',
            configResolved({ plugins }) {
              contextApi = plugins.find(
                (plugin) => plugin.name === 'tessera:context',
              )?.api;
            },
          } satisfies Plugin,
        ],
      }),
    );
    const settings = a11ySettingsFrom(contextApi!.validatedConfig());
    const manifest = contextApi!.manifest();
    const tags = axeTags(settings.standard);
    const disableRules = axeIgnoreRules(settings.ignore);

    server = await vite.preview({
      root: projectRoot,
      base: auditBaseConfig.base,
      build: { outDir: auditDist },
      preview: { port: 0, host: '127.0.0.1' },
      logLevel: 'warn',
    });
    const baseUrl = server.resolvedUrls?.local?.[0];
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

      const courseOrigin = auditUrl.origin;

      // Playwright's networkidle can't be awaited again after in-app
      // navigation (#442), so track requests to catch content a page renders
      // after a fetch. Only the main frame must also go 500ms without a
      // request starting or finishing: a polling frame's requests are rarely
      // in flight, so it can't hold the audit. A frame's own document is
      // waited on by frameLoaded.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pending = new Set<any>();
      let lastRequestAt = 0;
      let lastRequestUrl = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.on('request', (request: any) => {
        // An EventSource never finishes; networkidle ignores it too.
        if (request.resourceType() === 'eventsource') return;
        let frame;
        try {
          frame = request.frame();
        } catch {
          return; // A service worker request has no frame.
        }
        if (frame === page.mainFrame()) {
          lastRequestAt = Date.now();
          lastRequestUrl = request.url();
        } else if (
          request.isNavigationRequest() ||
          underCrossOrigin(frame, courseOrigin)
        ) {
          return;
        }
        pending.add(request);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settled = (request: any) => {
        if (pending.delete(request) && request.frame() === page.mainFrame()) {
          lastRequestAt = Date.now();
        }
      };
      page.on('requestfinished', settled);
      page.on('requestfailed', settled);
      const networkBusy = () =>
        pending.size > 0 || Date.now() - lastRequestAt < 500;

      await page.goto(auditUrl.href);
      await page.waitForSelector('#tessera-app', { timeout: 20_000 });

      const scan = async (): Promise<AxeViolation[]> => {
        const builder = new AxeBuilder({ page }).withTags(tags);
        if (disableRules.length > 0) builder.disableRules(disableRules);
        const found = auditFindings(await builder.analyze());
        return (await dropCrossOriginNodes(page, found, courseOrigin)).map(
          mapViolation,
        );
      };

      // A frame the page just added may still be loading, and axe would scan
      // its half-parsed document. A lazy frame loads only near the viewport,
      // so it is made eager. Cross-origin frames go unscanned, so no wait.
      const frameLoaded = async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frame: any,
        title: string,
        deadline: number,
      ) => {
        if (frame === page.mainFrame()) return;
        if (underCrossOrigin(frame.parentFrame(), courseOrigin)) return;
        const el = await frame.frameElement().catch(() => null);
        if (!el) return;
        // A lazy frame is still about:blank, so judge it by what it will load.
        const src: string | undefined = await el
          .evaluate((iframe: HTMLIFrameElement) =>
            iframe.hasAttribute('srcdoc')
              ? 'about:srcdoc'
              : iframe.src || 'about:blank',
          )
          .catch(() => undefined);
        const local = src !== undefined && !isCrossOrigin(src, courseOrigin);
        if (local) {
          await el
            .evaluate((iframe: HTMLIFrameElement) => {
              if (iframe.loading === 'lazy') iframe.loading = 'eager';
            })
            .catch(() => {});
        }
        await el.dispose();
        if (!local) return;
        // A 0 timeout would wait forever, so a frame past the deadline gets 1ms.
        await frame
          .waitForLoadState('load', {
            timeout: Math.max(1, deadline - Date.now()),
          })
          .catch((err: Error) => {
            if (err.name !== 'TimeoutError') return;
            console.warn(
              `${stderrTag('yellow')} ${title}: a frame (${src}) didn't load within 10s; scanned it as it was.`,
            );
          });
      };

      // Each pass reaches frames one level deeper: a loaded frame can hold
      // lazy frames of its own and start requests.
      const settle = async (title: string) => {
        const deadline = Date.now() + 10_000;
        const seen = new Set<unknown>();
        let busy: boolean;
        for (let depth = 0; ; depth++) {
          while ((busy = networkBusy()) && Date.now() < deadline) {
            await delay(100);
          }
          if (depth === 5) break;
          const fresh = page.frames().filter((f: unknown) => !seen.has(f));
          if (fresh.length === 0) break;
          for (const frame of fresh) seen.add(frame);
          await Promise.all(
            fresh.map((frame: unknown) => frameLoaded(frame, title, deadline)),
          );
        }
        if (busy) {
          const [request] = pending;
          console.warn(
            `${stderrTag('yellow')} ${title}: the network was still busy after 10s (${request?.url() ?? lastRequestUrl}); scanned the page as it was.`,
          );
        }
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
      for (let i = 0; i < totalPages; i++) {
        const title = manifest.pages[i]?.title ?? `Page ${i + 1}`;
        lastRequestAt = Date.now();
        await page.evaluate(
          (idx: number) => window.__tesseraAudit!.goToIndex(idx),
          i,
        );
        await page.waitForFunction(
          (idx: number) =>
            document.getElementById('tessera-app')?.dataset.tesseraPageIndex ===
            String(idx),
          i,
          { timeout: 20_000 },
        );
        await settle(title);
        pages.push(await recordPage(i, title));
        pending.clear();
      }
    } finally {
      await browser.close();
    }

    const thresholdRank = IMPACT_LEVELS.indexOf(threshold);
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
      `${stderrTag()} Audit could not complete: ${errorMessage(err)}`,
    );
    return 1;
  } finally {
    if (prevEnv === undefined) delete process.env[AUDIT_ENV_FLAG];
    else process.env[AUDIT_ENV_FLAG] = prevEnv;
    await server?.close().catch((err: unknown) => {
      console.warn(
        `${stderrTag('yellow')} Could not close the preview server: ${errorMessage(err)}`,
      );
    });
  }
}

function printSummary(report: AuditReport, reportPath: string): void {
  const thresholdRank = IMPACT_LEVELS.indexOf(report.threshold);
  for (const p of report.pages) {
    if (p.loadFailed) {
      console.log(`${styleText('red', '  ✗')} ${p.title}: failed to load`);
      continue;
    }
    if (p.violations.length === 0) {
      console.log(`${styleText('green', '  ✓')} ${p.title}`);
      continue;
    }
    const failing = p.violations.some((v) => isFailing(v, thresholdRank));
    const mark = failing ? styleText('red', '  ✗') : styleText('yellow', '  ⚠');
    console.log(`${mark} ${p.title}`);
    for (const v of p.violations) {
      console.log(
        `      [${v.impact ?? 'n/a'}] ${v.id}: ${v.help} (${v.nodes} node${v.nodes === 1 ? '' : 's'})`,
      );
      for (const el of v.elements.slice(0, MAX_ELEMENTS_SHOWN)) {
        console.log(
          styleText('gray', `        → ${el.target || '(unknown element)'}`),
        );
        if (el.summary) {
          console.log(styleText('gray', `          ${el.summary}`));
        }
      }
      const hidden = v.elements.length - MAX_ELEMENTS_SHOWN;
      if (hidden > 0) {
        console.log(
          styleText(
            'gray',
            `        … and ${hidden} more (see a11y-report.json)`,
          ),
        );
      }
    }
  }
  console.log(`\n[tessera a11y] Report written to ${reportPath}`);
  if (report.pagesFailedToLoad > 0) {
    const scanned = report.pagesAudited - report.pagesFailedToLoad;
    console.log(
      `[tessera a11y] Reached all ${report.totalPages} page(s); scanned ${scanned}, ${report.pagesFailedToLoad} failed to load.`,
    );
  } else {
    console.log(`[tessera a11y] Covered all ${report.totalPages} page(s).`);
  }
  if (report.passed) {
    console.log(
      `${styleText('green', '[tessera a11y] Passed')}: ${report.totalViolations} total finding(s), none at/above "${report.threshold}".`,
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
      `${styleText('red', '[tessera a11y] Failed')}: ${reasons.join('; ')}.`,
    );
  }
}
