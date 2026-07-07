import { test, expect } from '@playwright/test';

test.describe('单信号分析页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signal-analyzer', { waitUntil: 'domcontentloaded' });
  });

  test('页面渲染 — 标题正确', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /单信号分析/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('页面加载 — 参数区域可见', async ({ page }) => {
    await expect(page.getByText(/开始分析|指标|信号/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
