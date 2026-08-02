import { expect, type Page } from '@playwright/test';

export const PERF_BUDGET_MS = Number(process.env.E2E_BACKTEST_PERF_MS ?? 1_000);

// 预热：跑一次默认回测（热 worker 价格缓存与 DB 连接池），
export async function warmUpBacktest(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
    timeout: 15_000,
  });
  await runDefaultBacktest(page);
  await waitForSummaryStats(page, 30_000);
}

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
  // 幂等：serial 模式下页面可能已有组合（上一测试残留），直接用现有组合；
  if ((await page.getByPlaceholder('VTI').count()) === 0) {
    await page.getByRole('button', { name: /添加组合|Add Portfolio/ }).click();
    await page.getByRole('menuitem', { name: /添加空组合|Add Empty/ }).click();
    await fillAssetRow(page, 0, 'VTI', '60');
    await fillAssetRow(page, 1, 'BND', '40');
    await page.getByPlaceholder('VTI').nth(2).locator('xpath=..').locator('button').click();
  }
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
