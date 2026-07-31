import { test, expect } from '@playwright/test';

test.describe('战术配置页面（Tactical）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tactical', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /战术|Tactical/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('页面加载 — 信号编辑区域可见', async ({ page }) => {
    await expect(page.getByText(/信号|Signal|策略/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('页面加载 — 结果 Tab 区存在（backtest/whatif）', async ({ page }) => {
    await expect(page.getByText(/回测|Backtest|What-If/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
