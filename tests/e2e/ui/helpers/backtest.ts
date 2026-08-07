import { expect, type Browser, type Page } from '@playwright/test';

export const PERF_BUDGET_MS = Number(process.env.E2E_BACKTEST_PERF_MS ?? 1_000);

// 预热：跑一次默认回测（热 worker 价格缓存与 DB 连接池），
async function warmUpBacktest(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
    timeout: 15_000,
  });
  await runDefaultBacktest(page);
  await waitForSummaryStats(page, 30_000);
}

// serial 套件共享的 beforeAll 预热：独立 auth context，跑完即关
export async function warmUpSuite(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ storageState: '.auth/user.json' });
  const page = await ctx.newPage();
  await warmUpBacktest(page);
  await ctx.close();
}

export async function readCagrPercent(page: Page): Promise<number> {
  const headerRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
  const headers = await headerRow.locator('th, td').allTextContents();
  const cagrCol = headers.findIndex((h) => /CAGR/.test(h));
  expect(cagrCol).toBeGreaterThanOrEqual(0);
  const cells = await page.locator('tbody tr').first().locator('th, td').allTextContents();
  const cagrText = cells[cagrCol] ?? '';
  const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
  expect(cagrMatch).toBeTruthy();
  return parseFloat(cagrMatch![1]);
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
