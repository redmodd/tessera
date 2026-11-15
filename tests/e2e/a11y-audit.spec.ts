import { test, expect } from '@playwright/test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { VARIANTS_ROOT, variantDir, type FixtureName } from './global-setup.js';
import { runAudit } from '../../packages/tessera-learn/dist/plugin/index.js';

function copyVariant(fixture: FixtureName, name: string): string {
  const dir = resolve(VARIANTS_ROOT, fixture, name);
  rmSync(dir, { recursive: true, force: true });
  cpSync(variantDir(fixture, 'scorm12'), dir, { recursive: true });
  return dir;
}

function readReport(dir: string) {
  return JSON.parse(readFileSync(resolve(dir, 'a11y-report.json'), 'utf-8'));
}

async function audit(dir: string): Promise<number> {
  const sigtermListeners = process.listenerCount('SIGTERM');
  const code = await runAudit(dir, dir, { threshold: 'serious' });
  expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
  return code;
}

// runAudit serves dist/ and launches its own browser, so this is a single
// long-running call rather than a page-driven test.
test.describe('Tier 2 — runtime accessibility audit', () => {
  test('passes axe on the pre-built free/web fixture', async () => {
    test.setTimeout(120_000);
    const dir = variantDir('free', 'web');
    expect(existsSync(resolve(dir, 'dist', 'index.html'))).toBe(true);

    // Standalone fixture has no shared/ dir, so workspaceRoot is just the course
    // dir — runAudit's second arg only feeds the (here unused) $shared alias.
    const code = await audit(dir);

    const report = readReport(dir);

    expect(code).toBe(0);
    expect(report.totalPages).toBeGreaterThan(1);
    expect(report.pagesAudited).toBe(report.totalPages);
  });

  // A custom layout.svelte renders no default-layout sidebar, so enumeration
  // must come from the manifest, not clicked DOM buttons.
  test('audits every page of a custom-layout course (no sidebar)', async () => {
    test.setTimeout(120_000);
    const dir = variantDir('custom-layout', 'web');

    await audit(dir);

    const report = readReport(dir);

    expect(report.totalPages).toBe(3);
    expect(report.pagesAudited).toBe(3);
    expect(report.pages.map((p: { title: string }) => p.title)).toEqual([
      'Welcome',
      'Overview',
      'Summary',
    ]);
  });

  // The broken fixture's middle page throws on import: the audit must reach
  // every page, flag the failure, and fail the run rather than pass on the
  // accessible ErrorPage it renders.
  test('flags and fails on a page that fails to load', async () => {
    test.setTimeout(120_000);
    const dir = variantDir('broken-page', 'web');

    const code = await audit(dir);

    const report = readReport(dir);

    expect(report.totalPages).toBe(3);
    expect(report.pagesAudited).toBe(3);
    expect(report.pages.map((p: { title: string }) => p.title)).toEqual([
      'Welcome',
      'Broken',
      'Summary',
    ]);
    expect(report.pages[1].loadFailed).toBe(true);
    expect(report.pages[1].violations).toEqual([]);
    expect(report.pagesFailedToLoad).toBe(1);
    expect(report.passed).toBe(false);
    expect(code).toBe(1);
  });

  // tessera.config.js loads after runAudit starts and before its build
  // validates, so the edit it makes lands between the two. A fixture no other
  // audit uses: the audit build goes to the fixture's shared node_modules.
  test('scans with the a11y settings its build validated', async () => {
    test.setTimeout(120_000);
    const dir = copyVariant('quiz-timing', 'audit-settings');
    writeFileSync(
      resolve(dir, 'tessera.config.js'),
      `import { readFileSync, writeFileSync } from 'node:fs';
const config = new URL('./course.config.js', import.meta.url);
writeFileSync(
  config,
  readFileSync(config, 'utf-8').replace(
    'export default {',
    "export default { a11y: { standard: 'wcag21aa' },",
  ),
);
export default {};
`,
    );

    await audit(dir);

    const report = readReport(dir);
    expect(report.standard).toBe('wcag21aa');
  });

  // The same window as above, with a page added in it.
  test('scans the pages its build bundled', async () => {
    test.setTimeout(120_000);
    const dir = copyVariant('standalone-weight', 'audit-pages');
    writeFileSync(
      resolve(dir, 'tessera.config.js'),
      `import { writeFileSync } from 'node:fs';
writeFileSync(
  new URL('./pages/01-assessment/zz-added.svelte', import.meta.url),
  '<script module>export const pageConfig = { title: "Added" };</script><h1>Added</h1>',
);
export default {};
`,
    );

    await audit(dir);

    const report = readReport(dir);
    expect(report.totalPages).toBe(3);
    expect(report.pages.at(-1).title).toBe('Added');
  });

  test('scans same-origin frames but not cross-origin ones', async () => {
    test.setTimeout(120_000);
    // localhost is another site than the preview server's 127.0.0.1, so these
    // embeds are out-of-process cross-origin frames, like a YouTube Video.
    const embed = createServer(async (req, res) => {
      if (req.url === '/hang') return;
      if (req.url === '/stall') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<img src="/hang">');
      }
      if (req.url?.startsWith('/slow.js')) {
        await delay(Number(req.url.split('?')[1] ?? 1000));
        res.setHeader('Content-Type', 'text/javascript');
        return res.end('');
      }
      if (req.url?.startsWith('/data?')) {
        await delay(Number(req.url.slice('/data?'.length)));
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end('{}');
      }
      res.setHeader('Content-Type', 'text/html');
      res.end('<button></button><img src="data:,">');
    });
    try {
      embed.listen(0);
      await once(embed, 'listening');
      const embedUrl = `http://localhost:${(embed.address() as AddressInfo).port}/`;
      const dir = copyVariant('page-weight', 'audit-frames');
      const config = resolve(dir, 'course.config.js');
      const source = readFileSync(config, 'utf-8');
      const withCsp = source.replace(
        'export: {',
        "export: { csp: { 'frame-src': ['http://localhost:*'], 'object-src': ['http://localhost:*'], 'connect-src': ['http://localhost:*'] },",
      );
      // Without the CSP entry the embed is blocked and has no button to skip.
      expect(withCsp).not.toBe(source);
      writeFileSync(config, withCsp);
      // A WAV long enough that Chromium holds its preload="auto" request open
      // while it buffers.
      const wavBytes = 400 * 1024 * 1024;
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFFxxxxWAVEfmt ', 0);
      wavHeader.writeUInt32LE(36 + wavBytes, 4);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20);
      wavHeader.writeUInt16LE(2, 22);
      wavHeader.writeUInt32LE(44100, 24);
      wavHeader.writeUInt32LE(44100 * 4, 28);
      wavHeader.writeUInt16LE(4, 32);
      wavHeader.writeUInt16LE(16, 34);
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(wavBytes, 40);
      // The audit's preview server loads the course's vite.config.js, which
      // sends late.html slowly, so a frame navigating to it is mid-navigation
      // for a while, and streams the WAV.
      writeFileSync(
        resolve(dir, 'vite.config.js'),
        `import { tesseraPlugin } from 'tessera-learn/plugin';
export default {
  plugins: [
    tesseraPlugin({ standardOverride: process.env.TESSERA_STANDARD }),
    {
      name: 'slow-late-html',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url.endsWith('/late.html')) return setTimeout(next, 1000);
          if (!req.url.endsWith('/long.wav')) return next();
          res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': ${44 + wavBytes} });
          res.write(Buffer.from('${wavHeader.toString('base64')}', 'base64'));
          const chunk = Buffer.alloc(65536);
          let left = ${wavBytes};
          req.on('close', () => (left = 0));
          const pump = () => {
            while (left > 0) {
              left -= chunk.length;
              if (!res.write(chunk)) return res.once('drain', pump);
            }
            res.end();
          };
          pump();
        });
      },
    },
  ],
};
`,
      );
      // First and last, so the audit reaches the frames both by the initial
      // load and by in-app navigation (#442).
      writeFileSync(
        resolve(dir, 'pages/01-assessment/_meta.js'),
        `export default { title: 'Assessment', pages: ['frames', 'overlap', 'check', 'chained', 'late', 'exam', 'practice', 'frames-last'] };`,
      );
      // Renders a button when a request the Frames page starts mid-scan ends.
      writeFileSync(
        resolve(dir, 'pages/01-assessment/overlap.svelte'),
        `<script module>export const pageConfig = { title: "Overlap" };</script>
<script>
  let done = $state(!!window.overlapDone);
  addEventListener('overlap', () => (done = true));
</script>
<h1>Overlap</h1>
{#if done}<button></button>{/if}
`,
      );
      // A frame that gets its src only after the page went quiet.
      writeFileSync(
        resolve(dir, 'pages/01-assessment/late.svelte'),
        `<script module>export const pageConfig = { title: "Late" };</script>
<script>
  let src = $state();
  setTimeout(() => (src = './late.html'), 300);
</script>
<h1>Late</h1>
<iframe title="Late" {src}></iframe>
`,
      );
      // A request that starts 200ms after the one before it ends, with no
      // frame load to wait out in between, beside audio that keeps buffering.
      writeFileSync(
        resolve(dir, 'pages/01-assessment/chained.svelte'),
        `<script module>export const pageConfig = { title: "Chained" };</script>
<script>
  let late = $state(false);
  fetch('${embedUrl}data?1000').then(() =>
    setTimeout(() => fetch('${embedUrl}data?100').then(() => (late = true)), 200),
  );
</script>
<h1>Chained</h1>
{#if late}<button></button>{/if}
<audio preload="auto" src="./long.wav"></audio>
`,
      );
      // The page renders a button only after a slow fetch, and "Fetch" after
      // a slower one. "Asset" parses its button only after a slow script
      // loads; "Poll" keeps the network busy. "Unloaded" is a lazy Video below
      // the fold: still about:blank, so same-origin. "Below" is a lazy
      // same-origin frame the audit loads, holding a lazy frame whose script
      // outlasts the page's fetches. "Hang" is a cross-origin <object> that
      // never responds, and "Redirect" a same-origin frame that moves, before
      // it loads, to a cross-origin page that never loads. The page starts a request when
      // the audit first injects axe, so during its scan.
      const frames = `<script module>export const pageConfig = { title: "Frames" };</script>
<script>
  let late = $state(false);
  fetch('${embedUrl}data?2000').then(() => (late = true));
  if (!('axe' in window)) {
    let axe;
    Object.defineProperty(window, 'axe', {
      configurable: true,
      get: () => axe,
      set(value) {
        if (!axe) {
          fetch('${embedUrl}data?5000').then(() => {
            window.overlapDone = true;
            dispatchEvent(new Event('overlap'));
          });
        }
        axe = value;
      },
    });
  }
</script>
<h1>Frames</h1>
{#if late}<button></button>{/if}
<iframe title="Local" srcdoc="<button></button>"></iframe>
<iframe title="Asset" src="./sim.html"></iframe>
<iframe title="Fetch" src="./fetch.html"></iframe>
<iframe title="Poll" srcdoc="<script>setInterval(() => fetch('/poll'), 200)</script>"></iframe>
<iframe title="Sandboxed" sandbox="allow-scripts" srcdoc="<button></button>"></iframe>
<iframe title="Embed" src="${embedUrl}"></iframe>
<iframe title="Nested" srcdoc="<iframe title='Inner' src='${embedUrl}'></iframe>"></iframe>
<iframe srcdoc="<p>Untitled</p>"></iframe>
<object title="Hang" data="${embedUrl}hang"></object>
<iframe title="Redirect" src="./redirect.html"></iframe>
<div style="height: 30000px"></div>
<iframe title="Unloaded" loading="lazy" src="${embedUrl}"></iframe>
<iframe title="Below" loading="lazy" src="./nest.html"></iframe>
`;
      mkdirSync(resolve(dir, 'public'), { recursive: true });
      writeFileSync(
        resolve(dir, 'public/sim.html'),
        `<!doctype html><title>Sim</title><script src="${embedUrl}slow.js"></script><button></button>`,
      );
      writeFileSync(
        resolve(dir, 'public/fetch.html'),
        `<!doctype html><title>Fetch</title><script>fetch('${embedUrl}data?3000').then(() => document.body.append(document.createElement('button')))</script>`,
      );
      writeFileSync(
        resolve(dir, 'public/late.html'),
        `<!doctype html><title>Late</title><button></button>`,
      );
      writeFileSync(
        resolve(dir, 'public/nest.html'),
        `<!doctype html><title>Nest</title><div style="height: 30000px"></div><iframe title="Deep" loading="lazy" src="./deep.html"></iframe>`,
      );
      writeFileSync(
        resolve(dir, 'public/deep.html'),
        `<!doctype html><title>Deep</title><script src="${embedUrl}slow.js?7500"></script><button></button>`,
      );
      writeFileSync(
        resolve(dir, 'public/redirect.html'),
        `<!doctype html><title>Redirect</title><script>setTimeout(() => location.replace('${embedUrl}stall'), 1000)</script><script src="${embedUrl}slow.js?3000"></script>`,
      );
      for (const name of ['frames', 'frames-last']) {
        writeFileSync(
          resolve(dir, `pages/01-assessment/${name}.svelte`),
          frames,
        );
      }

      const warnings: string[] = [];
      const warn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      try {
        await audit(dir);
      } finally {
        console.warn = warn;
      }

      expect(warnings.filter((w) => w.includes('as it was'))).toEqual([]);
      const report = readReport(dir);
      const late = [1, 3, 4].map((i) => report.pages[i]);
      expect(late.map((page) => page.title)).toEqual([
        'Overlap',
        'Chained',
        'Late',
      ]);
      for (const page of late) {
        expect(page.violations).toMatchObject([
          { id: 'button-name', nodes: 1 },
        ]);
      }
      for (const page of [report.pages[0], report.pages.at(-1)]) {
        expect(page.title).toBe('Frames');
        expect(
          Object.fromEntries(
            page.violations.map((v: { id: string; nodes: number }) => [
              v.id,
              v.nodes,
            ]),
          ),
        ).toEqual({ 'button-name': 6, 'frame-title': 1 });
      }
    } finally {
      embed.closeAllConnections();
      embed.close();
    }
  });
});
