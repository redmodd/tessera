import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { variantDir } from './global-setup.js';
import { runAudit } from '../../packages/tessera-learn/dist/plugin/index.js';

// runAudit serves dist/ and launches its own browser, so this is a single
// long-running call rather than a page-driven test.
test.describe('Tier 2 — runtime accessibility audit', () => {
  test('passes axe on the pre-built free/web fixture', async () => {
    test.setTimeout(120_000);
    const dir = variantDir('free', 'web');
    expect(existsSync(resolve(dir, 'dist', 'index.html'))).toBe(true);

    // Standalone fixture has no shared/ dir, so workspaceRoot is just the course
    // dir — runAudit's second arg only feeds the (here unused) $shared alias.
    const code = await runAudit(dir, dir, {
      threshold: 'serious',
      rebuild: true,
    });

    const reportPath = resolve(dir, 'a11y-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

    expect(code).toBe(0);
    expect(report.totalPages).toBeGreaterThan(1);
    expect(report.pagesAudited).toBe(report.totalPages);
  });

  // A custom layout.svelte renders no default-layout sidebar, so enumeration
  // must come from the manifest, not clicked DOM buttons.
  test('audits every page of a custom-layout course (no sidebar)', async () => {
    test.setTimeout(120_000);
    const dir = variantDir('custom-layout', 'web');

    // rebuild: the variant's node_modules is a symlink to the source fixture,
    // so runAudit's .tessera-a11y build would otherwise persist across runs.
    await runAudit(dir, dir, { threshold: 'serious', rebuild: true });

    const reportPath = resolve(dir, 'a11y-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

    expect(report.totalPages).toBe(3);
    expect(report.pagesAudited).toBe(3);
    expect(report.pages.map((p: { title: string }) => p.title)).toEqual([
      'Welcome',
      'Overview',
      'Summary',
    ]);
  });

  // A page whose module throws on import renders an ErrorPage rather than
  // settling its navigation through the success path. The auditor must still
  // reach and scan every page instead of hanging on the broken one and aborting
  // the run with no report written.
  test('still audits every page when one page fails to load', async () => {
    test.setTimeout(120_000);
    const dir = variantDir('broken-page', 'web');

    await runAudit(dir, dir, { threshold: 'serious', rebuild: true });

    const reportPath = resolve(dir, 'a11y-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

    expect(report.totalPages).toBe(3);
    expect(report.pagesAudited).toBe(3);
    expect(report.pages.map((p: { title: string }) => p.title)).toEqual([
      'Welcome',
      'Broken',
      'Summary',
    ]);
  });
});
