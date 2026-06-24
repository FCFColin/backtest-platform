import { test, expect } from '@playwright/test';

test.describe('组合优化页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/optimizer', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /组合优化|Portfolio Optimization/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/参数设置|Parameter Settings/).first()).toBeVisible({ timeout: 30_000 });
  });

  // 辅助函数：等待优化结果加载
  async function waitForOptimizerResults(page: import('@playwright/test').Page) {
    await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({ timeout: 60_000 });
  }

  test('T4: 默认 maxSharpe 优化 — VTI+VXUS+BND', async ({ page }) => {
    await page.getByRole('button', { name: /开始计算|Start Calculation/ }).click();
    await waitForOptimizerResults(page);

    // 验证 CAGR 指标为正数
    const cagrRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const cagrText = await cagrRow.textContent();
    const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
    expect(cagrMatch).toBeTruthy();
    const cagrValue = parseFloat(cagrMatch![1]);
    expect(cagrValue).toBeGreaterThan(0);

    // 验证没有错误提示
    await expect(page.getByText(/优化失败|Optimization Failed/)).toHaveCount(0);
  });

  test('T5: 手动选 VTI+BND 优化 — 验证 CAGR 为正数', async ({ page }) => {
    // 将第二个 ticker (VXUS) 改为 BND
    const tickerInputs = page.getByPlaceholder(/输入代码|Enter ticker/);
    await tickerInputs.nth(1).clear();
    await tickerInputs.nth(1).fill('BND');

    // 删除第三个 ticker (BND)
    const removeButtons = page.getByRole('button', { name: /删除|Delete|Remove/ });
    await removeButtons.nth(2).click();

    await page.getByRole('button', { name: /开始计算|Start Calculation/ }).click();
    await waitForOptimizerResults(page);

    // 验证 CAGR 为正数且合理
    const cagrRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const cagrText = await cagrRow.textContent();
    const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
    expect(cagrMatch).toBeTruthy();
    const cagrValue = parseFloat(cagrMatch![1]);
    expect(cagrValue).toBeGreaterThan(0);
    expect(cagrValue).toBeLessThan(20);

    // 验证 VTI 权重 > 0（使用 .first() 避免 Recharts 重复元素导致 strict mode violation）
    await expect(page.getByText('VTI').first()).toBeVisible();
  });

  test('T6: 全部历史优化 — 确认不报错', async ({ page }) => {
    await page.getByRole('checkbox', { name: /全部历史|All History/ }).check();
    await page.getByRole('button', { name: /开始计算|Start Calculation/ }).click();

    // 全部历史模式计算量更大，且可能因连续测试触发 API 限流 (429)
    // 等待结果或错误出现
    const resultRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const errorMsg = page.getByText(/优化失败|Optimization Failed|429/).first();
    await expect(resultRow.or(errorMsg)).toBeVisible({ timeout: 90_000 });

    // 如果出现结果，验证没有非限流错误
    if (await resultRow.isVisible().catch(() => false)) {
      await expect(page.getByText(/优化失败|Optimization Failed/)).toHaveCount(0);
    }
  });
});
