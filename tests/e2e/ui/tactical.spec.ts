import { test, expect } from '@playwright/test';

test.describe('战术分配页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tactical', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /战术分配/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('页面加载 — 参数面板可见', async ({ page }) => {
    await expect(page.getByText(/战术策略参数/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('页面加载 — 结果区域存在', async ({ page }) => {
    await expect(page.getByText(/结果|Results|等权基准/).first()).toBeVisible({ timeout: 30_000 });
  });
});
