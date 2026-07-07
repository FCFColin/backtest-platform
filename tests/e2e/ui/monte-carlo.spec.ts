import { test, expect } from '@playwright/test';

test.describe('蒙特卡洛模拟页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/monte-carlo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /蒙特卡洛模拟/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('页面加载 — 参数面板可见', async ({ page }) => {
    await expect(page.getByText(/基本参数|目标设置|模拟参数/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('页面加载 — 结果区域存在', async ({ page }) => {
    await expect(page.getByText(/结果|分析|Summary|分布/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
