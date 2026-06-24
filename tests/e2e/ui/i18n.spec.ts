import { test, expect } from '@playwright/test';

test.describe('语言切换', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
  });

  test('T14: 切换到英文', async ({ page }) => {
    // 默认中文模式下，语言切换按钮显示 "EN"
    const langBtn = page.locator('nav button:has(svg.lucide-globe)');
    await expect(langBtn).toBeVisible();
    await expect(langBtn.getByText('EN')).toBeVisible();

    // 点击切换到英文
    await langBtn.click();

    // 验证页面文本变为英文 — "组合回测" 应变为 "Portfolio Backtest"
    await expect(page.getByText('Portfolio Backtest').first()).toBeVisible({ timeout: 10_000 });

    // 语言切换按钮现在应显示 "中文"
    await expect(langBtn.getByText('中文')).toBeVisible();
  });

  test('T15: 切换回中文', async ({ page }) => {
    const langBtn = page.locator('nav button:has(svg.lucide-globe)');

    // 先切换到英文
    await langBtn.click();
    await expect(page.getByText('Portfolio Backtest').first()).toBeVisible({ timeout: 10_000 });

    // 再切换回中文
    await langBtn.click();

    // 验证页面文本恢复为中文
    await expect(page.getByText('组合回测').first()).toBeVisible({ timeout: 10_000 });

    // 语言切换按钮应再次显示 "EN"
    await expect(langBtn.getByText('EN')).toBeVisible();
  });
});
