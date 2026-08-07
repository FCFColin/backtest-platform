import { test, expect } from '@playwright/test';

test.describe('语言切换', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
  });

  test('T14: 切换到英文', async ({ page }) => {
    const langBtn = page.getByTestId('language-selector');
    await expect(langBtn).toBeVisible();
    await expect(langBtn).toContainText('ZH');

    await langBtn.click();

    await expect(page.getByText('nav.portfolioBacktest').first()).toBeVisible({ timeout: 10_000 });

    await expect(langBtn).toContainText('EN');
  });

  test('T15: 切换回中文', async ({ page }) => {
    const langBtn = page.getByTestId('language-selector');

    await langBtn.click();
    await expect(page.getByText('nav.portfolioBacktest').first()).toBeVisible({ timeout: 10_000 });

    await langBtn.click();

    await expect(page.getByText('组合回测').first()).toBeVisible({ timeout: 10_000 });

    await expect(langBtn).toContainText('ZH');
  });
});
