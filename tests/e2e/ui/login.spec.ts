import { test, expect } from '@playwright/test';

test.describe('登录页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
  });

  test('页面渲染 — 标题、用户名/密码输入框、登录按钮', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /登录/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('用户名')).toBeVisible();
    await expect(page.getByText('密码')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /用户名/ })).toBeVisible();
    await expect(page.getByText('登录').first()).toBeVisible();
  });
});
