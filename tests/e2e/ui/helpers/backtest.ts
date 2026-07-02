import { expect, type Page } from '@playwright/test';

/** 首屏统计出现时间预算（ms）；CI 可设 E2E_BACKTEST_PERF_MS=5000，本地默认 12s */
export const PERF_BUDGET_MS = Number(process.env.E2E_BACKTEST_PERF_MS ?? 12_000);

/** 点击「开始回测」 */
export async function runDefaultBacktest(page: Page): Promise<void> {
  await page.getByTestId('backtest-run').click();
}

/** 等待 Summary 首屏统计区可见且含百分比数值 */
export async function waitForSummaryStats(page: Page, timeout = PERF_BUDGET_MS): Promise<void> {
  const stats = page.getByTestId('backtest-summary-stats');
  await expect(stats).toBeVisible({ timeout });
}

/** 开始回测按钮（含 loading 状态） */
export function getRunButton(page: Page) {
  return page.getByTestId('backtest-run');
}
