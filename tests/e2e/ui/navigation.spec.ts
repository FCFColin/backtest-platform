import { test, expect } from '@playwright/test';

test.describe('导航栏交互', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
  });

  test('T9: 导航到回测页', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /回测|Backtest/ }).click();
    // Radix Dropdown 渲染在 portal（body），item 语义为 menuitem
    await page.getByRole('menuitem', { name: /组合回测|Portfolio Backtest/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
    await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('T10: 导航到优化页', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /优化|Optimize/ }).click();
    await page.getByRole('menuitem', { name: /组合优化|Portfolio Optimization/ }).click();
    await expect(page).toHaveURL(/\/optimizer/, { timeout: 60_000 });
  });

  test('T11: 导航到数据引擎', async ({ page }) => {
    // 数据引擎是导航栏直接链接（无需展开下拉）
    const nav = page.getByRole('navigation');
    await nav.getByRole('link', { name: /数据引擎|Data Engine/ }).click();
    await expect(page).toHaveURL(/\/data-engine/, { timeout: 60_000 });
  });
});
