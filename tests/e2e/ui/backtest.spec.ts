import { test, expect } from '@playwright/test';
import { runDefaultBacktest, waitForSummaryStats, warmUpBacktest } from './helpers/backtest.js';

test.describe.configure({ mode: 'serial' });

test.describe('回测页面', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: '.auth/user.json' });
    const page = await ctx.newPage();
    await warmUpBacktest(page);
    await ctx.close();
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
    await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
      timeout: 1_000,
    });
  });

  async function getCagrValue(page: import('@playwright/test').Page): Promise<number> {
    const headerRow = page.locator('tr').filter({ hasText: /CAGR/ }).first();
    const headers = await headerRow.locator('th, td').allTextContents();
    const cagrCol = headers.findIndex((h) => /CAGR/.test(h));
    expect(cagrCol).toBeGreaterThanOrEqual(0);
    const dataRow = page.locator('tbody tr').first();
    const cells = await dataRow.locator('th, td').allTextContents();
    const cagrText = cells[cagrCol] ?? '';
    const cagrMatch = cagrText?.match(/([+-]?\d+\.?\d*)%/);
    expect(cagrMatch).toBeTruthy();
    return parseFloat(cagrMatch![1]);
  }

  test('T1: 默认回测 — VTI 60% + BND 40%', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 1_000);
    const cagrValue = await getCagrValue(page);
    expect(cagrValue).toBeGreaterThan(0);
  });

  test('T16: 跨页面状态持久化 — 回测后导航离开再返回', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 1_000);
    const cagrValue = await getCagrValue(page);
    expect(cagrValue).toBeGreaterThan(0);

    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /优化|Optimize/ }).click();
    await page.getByRole('menuitem', { name: /组合优化|Portfolio Optimization/ }).click();
    await expect(page).toHaveURL(/\/optimizer/, { timeout: 15_000 });

    await nav.getByRole('button', { name: /回测|Backtest/ }).click();
    await page.getByRole('menuitem', { name: /组合回测|Portfolio Backtest/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await expect(page.locator('tr').filter({ hasText: /CAGR/ }).first()).toBeVisible({
      timeout: 1_000,
    });
    const cagrValueAfter = await getCagrValue(page);
    expect(cagrValueAfter).toBeGreaterThan(0);
  });
});
