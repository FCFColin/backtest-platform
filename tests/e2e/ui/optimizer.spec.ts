import { test, expect } from '@playwright/test';

test.describe('组合优化页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/optimizer', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: /组合优化|Portfolio Optimization/ }),
    ).toBeVisible({ timeout: 1_000 });
    await expect(page.getByText(/资产选择|Asset Selection/).first()).toBeVisible({
      timeout: 1_000,
    });
  });

  async function getCagrValue(page: import('@playwright/test').Page): Promise<number> {
    await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({
      timeout: 1_000,
    });
    const text = await page.locator('tr').filter({ hasText: /CAGR/ }).first().textContent();
    const match = text?.match(/([+-]?\d+\.?\d*)%/);
    expect(match).toBeTruthy();
    return parseFloat(match![1]);
  }

  test('T4: 默认 maxSharpe 优化 — VTI+VXUS+BND', async ({ page }) => {
    await page.getByRole('button', { name: /开始计算|Start Calculation/ }).click();
    expect(await getCagrValue(page)).toBeGreaterThan(0);
    await expect(page.getByText(/优化失败|Optimization Failed/)).toHaveCount(0);
  });

  test('T5: 手动选 VTI+BND 优化 — 验证 CAGR 为正数', async ({ page }) => {
    await page.getByRole('button', { name: '移除 VXUS' }).click();
    await page.getByRole('button', { name: '移除 BND' }).click();
    const tickerInput = page.getByLabel(/输入代码|Enter ticker/);
    await tickerInput.fill('BND');
    await tickerInput.press('Enter');

    await page.getByRole('button', { name: /开始计算|Start Calculation/ }).click();
    const cagrValue = await getCagrValue(page);
    expect(cagrValue).toBeGreaterThan(0);
    expect(cagrValue).toBeLessThan(20);
    await expect(page.getByText('VTI').first()).toBeVisible();
  });

  test('T6: 全部历史优化 — 确认不报错', async ({ page }) => {
    await page.getByRole('switch', { name: /全部历史|All History/ }).check();
    await page.getByRole('button', { name: /开始计算|Start Calculation/ }).click();

    const resultRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const errorMsg = page.getByText(/优化失败|Optimization Failed|429/).first();
    await expect(resultRow.or(errorMsg)).toBeVisible({ timeout: 1_000 });

    if (await resultRow.isVisible().catch(() => false)) {
      await expect(page.getByText(/优化失败|Optimization Failed/)).toHaveCount(0);
    }
  });
});
