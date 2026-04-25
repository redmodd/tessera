import { test, expect } from '@playwright/test';

test.describe('Custom layout.svelte overrides default chrome', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('custom header renders, default sidebar does not', async ({ page }) => {
    await expect(page.getByTestId('custom-header')).toBeVisible();
    await expect(page.getByTestId('custom-main')).toBeVisible();
    await expect(page.locator('.tessera-sidebar')).toHaveCount(0);
    await expect(page.locator('.tessera-hamburger')).toHaveCount(0);
  });

  test('initial page content renders inside custom-main', async ({ page }) => {
    const main = page.getByTestId('custom-main');
    await expect(main.getByTestId('page-welcome')).toBeVisible();
  });

  test('custom-next advances the page', async ({ page }) => {
    await expect(page.getByTestId('page-welcome')).toBeVisible();
    await page.getByTestId('custom-next').click();
    await expect(page.getByTestId('page-overview')).toBeVisible();
  });

  test('custom-prev is disabled on the first page', async ({ page }) => {
    await expect(page.getByTestId('custom-prev')).toBeDisabled();
  });

  test('progress counter updates as the learner advances', async ({ page }) => {
    await expect(page.getByTestId('custom-progress')).toHaveText('1/3');
    await page.getByTestId('custom-next').click();
    await expect(page.getByTestId('custom-progress')).toHaveText('2/3');
    await page.getByTestId('custom-next').click();
    await expect(page.getByTestId('custom-progress')).toHaveText('3/3');
  });
});
