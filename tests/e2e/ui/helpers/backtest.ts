import { expect, type Page } from '@playwright/test';

export const PERF_BUDGET_MS = Number(process.env.E2E_BACKTEST_PERF_MS ?? 12_000);

export async function runDefaultBacktest(page: Page): Promise<void> {
  await page.getByTestId('backtest-run').click();
}

export async function waitForSummaryStats(page: Page, timeout = PERF_BUDGET_MS): Promise<void> {
  const stats = page.getByTestId('backtest-summary-stats');
  await expect(stats).toBeVisible({ timeout });
}

export function getRunButton(page: Page) {
  return page.getByTestId('backtest-run');
}
