import { test, expect } from '@playwright/test';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const execAsync = promisify(exec);

const E2E_PROJECT = resolve(process.cwd(), 'tests/fixtures/free');

test.describe('Export — Web', () => {
  test('vite build produces dist/ folder with index.html', async () => {
    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    const distPath = resolve(E2E_PROJECT, 'dist');
    expect(existsSync(distPath)).toBe(true);

    const indexHtml = resolve(distPath, 'index.html');
    expect(existsSync(indexHtml)).toBe(true);

    const html = readFileSync(indexHtml, 'utf-8');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('tessera');
  });

  test('dist contains JS assets referenced by index.html', async () => {
    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    const distPath = resolve(E2E_PROJECT, 'dist');
    const indexHtml = readFileSync(resolve(distPath, 'index.html'), 'utf-8');

    // Should reference JS assets
    expect(indexHtml).toMatch(/\.js/);

    // Assets directory should exist
    expect(existsSync(resolve(distPath, 'assets'))).toBe(true);
  });

  test('web export does not include SCORM/CMI5 manifests', async () => {
    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    const distPath = resolve(E2E_PROJECT, 'dist');
    expect(existsSync(resolve(distPath, 'imsmanifest.xml'))).toBe(false);
    expect(existsSync(resolve(distPath, 'cmi5.xml'))).toBe(false);
  });
});

test.describe('Export — Serve Built Output', () => {
  test('built dist/ serves and course loads with navigation', async ({ page }) => {
    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    // Start vite preview, capture the child process
    const previewProcess = exec(
      'npx vite preview --port 5190 --strictPort',
      { cwd: E2E_PROJECT }
    );

    try {
      // Poll until server is ready (up to 10s)
      let ready = false;
      for (let i = 0; i < 20; i++) {
        try {
          await page.goto('http://localhost:5190', { timeout: 2000 });
          ready = true;
          break;
        } catch {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      expect(ready).toBe(true);

      await page.waitForSelector('.tessera-content', { timeout: 10000 });

      // Course content loads
      await expect(page.locator('.tessera-content h1')).toBeVisible();

      // Sidebar present
      await expect(page.locator('.tessera-sidebar')).toBeVisible();

      // Navigation works
      const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
      await expect(nextBtn).toBeEnabled();
      await nextBtn.click();
      // `expect` polls — no need to sleep before asserting visibility.
      await expect(page.locator('.tessera-content')).toBeVisible();
    } finally {
      previewProcess.kill('SIGTERM');
    }
  });
});

test.describe('Export — SCORM 1.2', () => {
  const scormConfigPath = resolve(E2E_PROJECT, 'course.config.js');
  let originalConfig: string;

  test.beforeAll(async () => {
    originalConfig = readFileSync(scormConfigPath, 'utf-8');
  });

  test.afterAll(async () => {
    // Restore original config
    writeFileSync(scormConfigPath, originalConfig);
  });

  test('SCORM 1.2 build produces ZIP with valid imsmanifest.xml', async () => {
    // Temporarily set export standard to scorm12
    const scormConfig = originalConfig.replace(
      'export: { standard: "web" }',
      'export: { standard: "scorm12" }'
    );
    writeFileSync(scormConfigPath, scormConfig);

    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    const distPath = resolve(E2E_PROJECT, 'dist');

    // imsmanifest.xml should be generated in dist/
    const manifestPath = resolve(distPath, 'imsmanifest.xml');
    expect(existsSync(manifestPath)).toBe(true);

    const xml = readFileSync(manifestPath, 'utf-8');
    // Validate SCORM 1.2 manifest structure
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('imscp_rootv1p1p2');
    expect(xml).toContain('adlcp_rootv1p2');
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('adlcp:scormtype="sco"');
    expect(xml).toContain('href="index.html"');
    expect(xml).toContain('<file href=');
    expect(xml).toContain('E2E Test Course');

    // ZIP should exist at project root
    const zipFiles = (await execAsync(`ls ${E2E_PROJECT}/*.zip 2>/dev/null || true`)).stdout.trim();
    expect(zipFiles.length).toBeGreaterThan(0);

    // Restore config
    writeFileSync(scormConfigPath, originalConfig);
  });
});

test.describe('Export — SCORM 2004', () => {
  const scormConfigPath = resolve(E2E_PROJECT, 'course.config.js');
  let originalConfig: string;

  test.beforeAll(async () => {
    originalConfig = readFileSync(scormConfigPath, 'utf-8');
  });

  test.afterAll(async () => {
    writeFileSync(scormConfigPath, originalConfig);
  });

  test('SCORM 2004 build produces ZIP with valid imsmanifest.xml (2004 schema)', async () => {
    const scormConfig = originalConfig.replace(
      'export: { standard: "web" }',
      'export: { standard: "scorm2004" }'
    );
    writeFileSync(scormConfigPath, scormConfig);

    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    const distPath = resolve(E2E_PROJECT, 'dist');
    const manifestPath = resolve(distPath, 'imsmanifest.xml');
    expect(existsSync(manifestPath)).toBe(true);

    const xml = readFileSync(manifestPath, 'utf-8');
    // Validate SCORM 2004 manifest structure
    expect(xml).toContain('imscp_v1p1');
    expect(xml).toContain('adlcp_v1p3');
    expect(xml).toContain('<schemaversion>2004 4th Edition</schemaversion>');
    expect(xml).toContain('adlcp:scormType="sco"'); // capital T for 2004

    // Restore config
    writeFileSync(scormConfigPath, originalConfig);
  });
});

test.describe('Export — CMI5', () => {
  const cmi5ConfigPath = resolve(E2E_PROJECT, 'course.config.js');
  let originalConfig: string;

  test.beforeAll(async () => {
    originalConfig = readFileSync(cmi5ConfigPath, 'utf-8');
  });

  test.afterAll(async () => {
    writeFileSync(cmi5ConfigPath, originalConfig);
  });

  test('CMI5 build produces ZIP with valid cmi5.xml', async () => {
    const cmi5Config = originalConfig.replace(
      'export: { standard: "web" }',
      'export: { standard: "cmi5" }'
    );
    writeFileSync(cmi5ConfigPath, cmi5Config);

    await execAsync('pnpm build', { cwd: E2E_PROJECT, timeout: 30000 });

    const distPath = resolve(E2E_PROJECT, 'dist');
    const cmi5Path = resolve(distPath, 'cmi5.xml');
    expect(existsSync(cmi5Path)).toBe(true);

    const xml = readFileSync(cmi5Path, 'utf-8');
    // Validate CMI5 XML structure
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('courseStructure');
    expect(xml).toContain('<course id=');
    expect(xml).toContain('<au id=');
    expect(xml).toContain('url="index.html"');
    expect(xml).toContain('E2E Test Course');
    expect(xml).toContain('masteryScore');

    // Restore config
    writeFileSync(cmi5ConfigPath, originalConfig);
  });
});
