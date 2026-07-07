import { test, expect } from '@playwright/test';

test.describe('PCA 主成分分析页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pca', { waitUntil: 'domcontentloaded' });
  });

  test('页面渲染 — 标题正确', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /主成分分析.*PCA/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('页面加载 — 参数面板可见', async ({ page }) => {
    await expect(page.getByText(/开始分析|分析参数|时间范围/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
