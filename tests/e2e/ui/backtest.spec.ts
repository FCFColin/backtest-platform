import { test, expect } from '@playwright/test';
import { runDefaultBacktest, waitForSummaryStats } from './helpers/backtest.js';

test.describe.configure({ mode: 'serial' });

test.describe('回测页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('参数设置').first()).toBeVisible({ timeout: 30_000 });
  });

  // 辅助函数：从 CAGR 行提取百分比值
  async function getCagrValue(page: import('@playwright/test').Page): Promise<number> {
    // CAGR 在 KeyStatsSummary 表格中，行 key="cagr"，标签在第一个 td，值在后续 td
    const cagrRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const cagrText = await cagrRow.textContent();
    const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
    expect(cagrMatch).toBeTruthy();
    return parseFloat(cagrMatch![1]);
  }

  test('T1: 默认回测 — VTI 60% + BND 40%', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 60_000);
    const cagrValue = await getCagrValue(page);
    expect(cagrValue).toBeGreaterThan(0);
  });

  test('T16: 跨页面状态持久化 — 回测后导航离开再返回', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 60_000);
    const cagrValue = await getCagrValue(page);
    expect(cagrValue).toBeGreaterThan(0);

    // 导航到优化页面
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /优化|Optimize/ }).click();
    await nav.getByRole('link', { name: /组合优化|Portfolio Optimization/ }).click();
    await expect(page).toHaveURL(/\/optimizer/, { timeout: 60_000 });

    // 导航回回测页面
    await nav.getByRole('button', { name: /回测|Backtest/ }).click();
    await nav.getByRole('link', { name: /组合回测|Portfolio Backtest/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });

    // 验证 CAGR 结果仍然可见
    await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({
      timeout: 30_000,
    });
    const cagrValueAfter = await getCagrValue(page);
    expect(cagrValueAfter).toBeGreaterThan(0);
  });
});
