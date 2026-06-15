import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { variantDir, viteBin } from './global-setup.js';

test.describe('Export — Web', () => {
  test('vite build produces dist/ folder with index.html', async () => {
    const distPath = resolve(variantDir('free', 'web'), 'dist');
    expect(existsSync(distPath)).toBe(true);

    const indexHtml = resolve(distPath, 'index.html');
    expect(existsSync(indexHtml)).toBe(true);

    const html = readFileSync(indexHtml, 'utf-8');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('tessera');
  });

  test('dist contains JS assets referenced by index.html', async () => {
    const distPath = resolve(variantDir('free', 'web'), 'dist');
    const indexHtml = readFileSync(resolve(distPath, 'index.html'), 'utf-8');

    // Should reference JS assets
    expect(indexHtml).toMatch(/\.js/);

    // Assets directory should exist
    expect(existsSync(resolve(distPath, 'assets'))).toBe(true);
  });

  test('web export does not include SCORM/CMI5 manifests', async () => {
    const distPath = resolve(variantDir('free', 'web'), 'dist');
    expect(existsSync(resolve(distPath, 'imsmanifest.xml'))).toBe(false);
    expect(existsSync(resolve(distPath, 'cmi5.xml'))).toBe(false);
  });
});

test.describe('Export — Serve Built Output', () => {
  test('built dist/ serves and course loads with navigation', async ({
    page,
  }) => {
    const webDir = variantDir('free', 'web');

    // Start vite preview, capture the child process
    const previewProcess = execFile(
      viteBin('free'),
      ['preview', webDir, '--port', '5190', '--strictPort'],
      { cwd: webDir },
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

test.describe('Export — SCORM 1.2', () => {
  test('SCORM 1.2 build produces ZIP with valid imsmanifest.xml', async () => {
    const scormDir = variantDir('free', 'scorm12');
    const distPath = resolve(scormDir, 'dist');

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

    // ZIP should exist at the variant root (runExport writes it next to dist/)
    const zipFiles = readdirSync(scormDir).filter((f) => f.endsWith('.zip'));
    expect(zipFiles.length).toBeGreaterThan(0);
  });
});

test.describe('Export — SCORM 2004', () => {
  test('SCORM 2004 build produces ZIP with valid imsmanifest.xml (2004 schema)', async () => {
    const distPath = resolve(variantDir('free', 'scorm2004'), 'dist');
    const manifestPath = resolve(distPath, 'imsmanifest.xml');
    expect(existsSync(manifestPath)).toBe(true);

    const xml = readFileSync(manifestPath, 'utf-8');
    // Validate SCORM 2004 manifest structure
    expect(xml).toContain('imscp_v1p1');
    expect(xml).toContain('adlcp_v1p3');
    expect(xml).toContain('<schemaversion>2004 4th Edition</schemaversion>');
    expect(xml).toContain('adlcp:scormType="sco"'); // capital T for 2004
  });
});

test.describe('Export — CMI5', () => {
  test('CMI5 build produces ZIP with valid cmi5.xml', async () => {
    const distPath = resolve(variantDir('free', 'cmi5'), 'dist');
    const cmi5Path = resolve(distPath, 'cmi5.xml');
    expect(existsSync(cmi5Path)).toBe(true);

    const xml = readFileSync(cmi5Path, 'utf-8');
    // Validate CMI5 XML structure
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('courseStructure');
    expect(xml).toContain('<course id=');
    expect(xml).toContain('<au id=');
    // cmi5 CourseStructure XSD requires <url> as a child element of <au>, not an attribute.
    expect(xml).toContain('<url>index.html</url>');
    expect(xml).toContain('launchMethod="AnyWindow"');
    expect(xml).toContain('E2E Test Course');
    expect(xml).toContain('masteryScore');
  });
});

test.describe('Export — xAPI', () => {
  test('xAPI build produces a tincan.xml alongside index.html', async () => {
    const distPath = resolve(variantDir('free', 'xapi'), 'dist');
    const tincanPath = resolve(distPath, 'tincan.xml');
    expect(existsSync(tincanPath)).toBe(true);
    expect(existsSync(resolve(distPath, 'index.html'))).toBe(true);

    const xml = readFileSync(tincanPath, 'utf-8');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('xmlns="http://projecttincan.com/tincan.xsd"');
    expect(xml).toContain('<activity id=');
    expect(xml).toContain('<launch lang="en-us">index.html</launch>');
    expect(xml).toContain('E2E Test Course');
    // No SCORM/cmi5 manifest leaks into the Tin Can package.
    expect(existsSync(resolve(distPath, 'cmi5.xml'))).toBe(false);
    expect(existsSync(resolve(distPath, 'imsmanifest.xml'))).toBe(false);
  });
});
