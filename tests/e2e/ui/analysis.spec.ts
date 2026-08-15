import { test, expect, type Page } from '@playwright/test';

async function expectPositiveCagr(page: Page) {
  await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({
    timeout: 1_000,
  });

  const cagrRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
  const cagrText = await cagrRow.textContent();
  const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
  expect(cagrMatch).toBeTruthy();
  const cagrValue = parseFloat(cagrMatch![1]);
  expect(cagrValue).toBeGreaterThan(0);
}

test.describe('资产分析页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analysis', { waitUntil: 'domcontentloaded', timeout: 1_000 });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
    await expect(page.getByRole('heading', { name: /资产分析|Asset Analysis/ })).toBeVisible({
      timeout: 1_000,
    });
  });

  test('T12: 默认分析 — SPY+TLT+GLD', async ({ page }) => {
    await page.getByRole('button', { name: /开始分析|Start Analysis/ }).click();
    await expectPositiveCagr(page);
  });

  test('T13: 自定义标的组合分析 — 添加 VTI，删除 GLD', async ({ page }) => {
    const tickerInput = page.getByPlaceholder(/输入代码|Enter ticker/).last();
    await tickerInput.fill('VTI');
    await tickerInput.press('Enter');

    const removeButtons = page.getByRole('button', { name: /删除|Delete|Remove/ });
    await removeButtons.nth(2).click();

    await page.getByRole('button', { name: /开始分析|Start Analysis/ }).click();
    await expectPositiveCagr(page);
  });
});
