import { test, expect } from '@playwright/test';
import {
  runDefaultBacktest,
  waitForSummaryStats,
  warmUpSuite,
  readCagrPercent,
} from './helpers/backtest.js';

test.describe.configure({ mode: 'serial' });

test.describe('回测页面', () => {
  test.beforeAll(async ({ browser }) => warmUpSuite(browser));
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
    await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
      timeout: 1_000,
    });
  });

  test('T1: 默认回测 — VTI 60% + BND 40%', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 1_000);
    const cagrValue = await readCagrPercent(page);
    expect(cagrValue).toBeGreaterThan(0);
  });

  test('T16: 跨页面状态持久化 — 回测后导航离开再返回', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 1_000);
    const cagrValue = await readCagrPercent(page);
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
    const cagrValueAfter = await readCagrPercent(page);
    expect(cagrValueAfter).toBeGreaterThan(0);
  });
});
