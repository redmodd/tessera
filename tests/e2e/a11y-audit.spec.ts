import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
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

    const code = await runAudit(dir, { threshold: 'serious' });

    expect(existsSync(resolve(dir, 'a11y-report.json'))).toBe(true);
    expect(code).toBe(0);
  });
});
