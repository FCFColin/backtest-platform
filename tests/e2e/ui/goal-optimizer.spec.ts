import { test, expect } from '@playwright/test';

test.describe('目标优化器页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/goal-optimizer', { waitUntil: 'domcontentloaded' });
  });

  test('页面渲染 — 标题正确', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /目标优化器/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('页面加载 — 参数区域可见', async ({ page }) => {
    await expect(page.getByText(/目标金额|初始金额|模拟/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
