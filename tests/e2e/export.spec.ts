import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { variantDir, viteBin } from './global-setup.js';

test.describe('Export — Serve Built Output', () => {
  test('built dist/ serves and course loads with navigation', async ({
    page,
  }) => {
    const webDir = variantDir('free', 'web');

    // Start vite preview, capture the child process
    const previewProcess = execFile(
      viteBin('free'),
      ['preview', webDir, '--port', '5190', '--strictPort'],
      { cwd: webDir, env: { ...process.env, TESSERA_STANDARD: '' } },
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
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      expect(ready).toBe(true);

      await page.waitForSelector('.tessera-content', { timeout: 10000 });

      // Course content loads
      await expect(page.locator('.tessera-content h1')).toBeVisible();

      // Sidebar present
      await expect(page.locator('.tessera-sidebar')).toBeVisible();

      // Navigation works
      const nextBtn = page.locator('.tessera-page-nav-btn', {
        hasText: 'Next',
      });
      await expect(nextBtn).toBeEnabled();
      await nextBtn.click();
      // `expect` polls — no need to sleep before asserting visibility.
      await expect(page.locator('.tessera-content')).toBeVisible();
    } finally {
      previewProcess.kill('SIGTERM');
    }
  });
});

test.describe('Export — LMS packages', () => {
  test('SCORM 1.2 build writes imsmanifest.xml and a ZIP', () => {
    const scormDir = variantDir('free', 'scorm12');
    const xml = readFileSync(
      resolve(scormDir, 'dist', 'imsmanifest.xml'),
      'utf-8',
    );
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('E2E Test Course');
    expect(readdirSync(scormDir).some((f) => f.endsWith('.zip'))).toBe(true);
  });

  test('SCORM 2004 build writes a 2004 imsmanifest.xml', () => {
    const xml = readFileSync(
      resolve(variantDir('free', 'scorm2004'), 'dist', 'imsmanifest.xml'),
      'utf-8',
    );
    expect(xml).toContain('<schemaversion>2004 4th Edition</schemaversion>');
    expect(xml).toContain('E2E Test Course');
  });

  test('cmi5 build writes cmi5.xml', () => {
    const xml = readFileSync(
      resolve(variantDir('free', 'cmi5'), 'dist', 'cmi5.xml'),
      'utf-8',
    );
    expect(xml).toContain('courseStructure');
    expect(xml).toContain('E2E Test Course');
  });

  test('xAPI build writes tincan.xml', () => {
    const xml = readFileSync(
      resolve(variantDir('free', 'xapi'), 'dist', 'tincan.xml'),
      'utf-8',
    );
    expect(xml).toContain('tincan.xsd');
    expect(xml).toContain('E2E Test Course');
  });
});
