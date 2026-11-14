import { test, expect } from '@playwright/test';
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
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
    const embed = createServer((_, res) => {
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
        "export: { csp: { 'frame-src': ['http://localhost:*'] },",
      );
      // Without the CSP entry the embed is blocked and has no button to skip.
      expect(withCsp).not.toBe(source);
      writeFileSync(config, withCsp);
      // The first page: the audit's networkidle wait doesn't settle after
      // navigating to a page that adds a local frame (#442).
      writeFileSync(
        resolve(dir, 'pages/01-assessment/_meta.js'),
        `export default { title: 'Assessment', pages: ['frames', 'check', 'exam', 'practice'] };`,
      );
      // "Unloaded" is a lazy Video below the fold: still about:blank, so same-origin.
      writeFileSync(
        resolve(dir, 'pages/01-assessment/frames.svelte'),
        `<script module>export const pageConfig = { title: "Frames" };</script>
<h1>Frames</h1>
<iframe title="Local" srcdoc="<button></button>"></iframe>
<iframe title="Sandboxed" sandbox="allow-scripts" srcdoc="<button></button>"></iframe>
<iframe title="Embed" src="${embedUrl}"></iframe>
<iframe title="Nested" srcdoc="<iframe title='Inner' src='${embedUrl}'></iframe>"></iframe>
<iframe srcdoc="<p>Untitled</p>"></iframe>
<div style="height: 30000px"></div>
<iframe title="Unloaded" loading="lazy" src="${embedUrl}"></iframe>
`,
      );

      await audit(dir);

      const report = readReport(dir);
      const page = report.pages[0];
      expect(page.title).toBe('Frames');
      expect(
        Object.fromEntries(
          page.violations.map((v: { id: string; nodes: number }) => [
            v.id,
            v.nodes,
          ]),
        ),
      ).toEqual({ 'button-name': 2, 'frame-title': 1 });
    } finally {
      embed.close();
    }
  });
});
