import { test, expect } from '@playwright/test';
import {
  PERF_BUDGET_MS,
  runDefaultBacktest,
  waitForSummaryStats,
  getRunButton,
} from './helpers/backtest.js';

test.describe.configure({ mode: 'serial' });

test.describe('回测提速回归', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('参数设置').first()).toBeVisible({ timeout: 30_000 });
  });

  test('P1: 默认回测 — 首屏统计在预算内出现', async ({ page }) => {
    const started = Date.now();
    await runDefaultBacktest(page);
    await waitForSummaryStats(page);
    expect(Date.now() - started).toBeLessThan(PERF_BUDGET_MS);
  });

  test('P2: 渐进 loading — 统计出现时按钮已恢复可点', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 60_000);
    const runBtn = getRunButton(page);
    await expect(runBtn).toBeEnabled({ timeout: 5_000 });
    await expect(runBtn).toHaveText(/开始回测|Start Backtest/i);
  });

  test('P3: sync 载荷 — 省略 rollingReturns 且体积 <80KB', async ({ page }) => {
    let portfolioResponseBody = '';
    let portfolioJson: {
      data?: { portfolios?: Array<{ rollingReturns?: unknown }> };
    } = {};

    page.on('response', async (response) => {
      const url = response.url();
      if (
        response.request().method() === 'POST' &&
        url.includes('/backtest/portfolio') &&
        !url.includes('/portfolio/series') &&
        response.ok()
      ) {
        portfolioResponseBody = await response.text();
        try {
          portfolioJson = JSON.parse(portfolioResponseBody) as typeof portfolioJson;
        } catch {
          // 非 JSON 响应忽略
        }
      }
    });

    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 60_000);

    expect(portfolioResponseBody.length).toBeGreaterThan(0);
    expect(portfolioResponseBody.length).toBeLessThan(80 * 1024);
    expect(portfolioJson.data?.portfolios?.[0]?.rollingReturns).toBeUndefined();
  });

  test('P4: series 缓存补全 — Rolling tab 触发 /portfolio/series 200', async ({ page }) => {
    await runDefaultBacktest(page);
    await waitForSummaryStats(page, 60_000);

    const seriesResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/portfolio/series') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 30_000 },
    );

    await page.getByTestId('backtest-tab-rolling').click();
    await seriesResponse;

    await expect(page.getByText(/回测失败|run failed/i)).toHaveCount(0);
  });
});
