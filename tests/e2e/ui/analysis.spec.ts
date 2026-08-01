import { test, expect } from '@playwright/test';

test.describe('资产分析页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analysis', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /资产分析|Asset Analysis/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('T12: 默认分析 — SPY+TLT+GLD', async ({ page }) => {
    // 默认已有 SPY、TLT、GLD 三个 ticker，直接点击"开始分析"
    await page.getByRole('button', { name: /开始分析|Start Analysis/ }).click();

    // 等待结果出现 — CAGR 指标在统计概览表格中
    await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({
      timeout: 60_000,
    });

    // 验证 CAGR 为正数
    const cagrRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const cagrText = await cagrRow.textContent();
    const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
    expect(cagrMatch).toBeTruthy();
    const cagrValue = parseFloat(cagrMatch![1]);
    expect(cagrValue).toBeGreaterThan(0);
  });

  test('T13: 自定义标的组合分析 — 添加 VTI，删除 GLD', async ({ page }) => {
    // 标签式输入：输入框输入 VTI 回车添加
    const tickerInput = page.getByPlaceholder(/输入代码|Enter ticker/).last();
    await tickerInput.fill('VTI');
    await tickerInput.press('Enter');

    // 删除 GLD（Badge 上的 X 删除按钮，前三个是 SPY、TLT、GLD）
    const removeButtons = page.getByRole('button', { name: /删除|Delete|Remove/ });
    await removeButtons.nth(2).click();

    // 点击"开始分析"
    await page.getByRole('button', { name: /开始分析|Start Analysis/ }).click();

    // 等待结果出现
    await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({
      timeout: 60_000,
    });

    // 验证 CAGR 为正数
    const cagrRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const cagrText = await cagrRow.textContent();
    const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
    expect(cagrMatch).toBeTruthy();
    const cagrValue = parseFloat(cagrMatch![1]);
    expect(cagrValue).toBeGreaterThan(0);
  });
});
