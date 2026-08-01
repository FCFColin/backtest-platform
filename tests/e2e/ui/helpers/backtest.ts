import { expect, type Page } from '@playwright/test';

export const PERF_BUDGET_MS = Number(process.env.E2E_BACKTEST_PERF_MS ?? 12_000);

async function fillAssetRow(
  page: Page,
  rowIndex: number,
  ticker: string,
  weight: string,
): Promise<void> {
  const row = page.getByPlaceholder('VTI').nth(rowIndex).locator('xpath=..');
  await row.locator('input').first().fill(ticker);
  await row.locator('input[type="number"]').fill(weight);
}

export async function runDefaultBacktest(page: Page): Promise<void> {
  // 页面无默认组合（store 初始为空）：添加空组合（默认 3 行占位），填 VTI 60% + BND 40%，
  // 删除第 3 行（校验拒绝空 ticker）
  await page.getByRole('button', { name: /添加组合|Add Portfolio/ }).click();
  await page.getByRole('menuitem', { name: /添加空组合|Add Empty/ }).click();
  await fillAssetRow(page, 0, 'VTI', '60');
  await fillAssetRow(page, 1, 'BND', '40');
  await page.getByPlaceholder('VTI').nth(2).locator('xpath=..').locator('button').click();
  const runBtn = page.getByTestId('backtest-run');
  await expect(runBtn).toBeEnabled({ timeout: 10_000 });
  await runBtn.click();
}

export async function waitForSummaryStats(page: Page, timeout = PERF_BUDGET_MS): Promise<void> {
  await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({ timeout });
}

export function getRunButton(page: Page) {
  return page.getByTestId('backtest-run');
}
