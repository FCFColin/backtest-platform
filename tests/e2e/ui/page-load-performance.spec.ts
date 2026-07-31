import { test, expect } from '@playwright/test';

const FCP_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_FCP ?? 100);
const NAV_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_NAV ?? 100);
const TTBF_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_TTFB ?? 100);
const LOAD_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_LOAD ?? 500);

test.describe('页面加载性能预算', () => {
  test('P1: 首页 FCP < 100ms', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
      return fcpEntry ? Math.round(fcpEntry.startTime) : -1;
    });

    console.log(`[perf] FCP: ${fcp}ms (budget: ${FCP_BUDGET_MS}ms)`);
    expect(fcp).toBeGreaterThanOrEqual(0);
    expect(fcp).toBeLessThan(FCP_BUDGET_MS);
  });

  test('P2: 首页 Navigation Timing (TTFB + DOM Ready + Load)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (!nav) return null;
      return {
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domReady: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        load: Math.round(nav.loadEventEnd - nav.startTime),
      };
    });

    expect(metrics).not.toBeNull();
    console.log(`[perf] TTFB: ${metrics!.ttfb}ms (budget: ${TTBF_BUDGET_MS}ms)`);
    console.log(`[perf] DOM Ready: ${metrics!.domReady}ms`);
    console.log(`[perf] Load: ${metrics!.load}ms (budget: ${LOAD_BUDGET_MS}ms)`);

    expect(metrics!.ttfb).toBeLessThan(TTBF_BUDGET_MS);
    expect(metrics!.load).toBeLessThan(LOAD_BUDGET_MS);
  });
});

test.describe('页面导航性能预算', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('参数设置').first()).toBeVisible({ timeout: 15_000 });
  });

  const NAVIGATIONS = [
    { label: '蒙特卡洛模拟', linkRole: 'link', linkName: /monte carlo|蒙特卡洛/i, route: '/monte-carlo' },
    { label: '优化器', linkRole: 'link', linkName: /optimizer|优化器/i, route: '/optimizer' },
    { label: 'PCA 分析', linkRole: 'link', linkName: /pca/i, route: '/pca' },
    { label: '定价', linkRole: 'link', linkName: /pricing|定价/i, route: '/pricing' },
  ];

  for (const nav of NAVIGATIONS) {
    test(`P3: ${nav.label} 导航耗时 < ${NAV_BUDGET_MS}ms`, async ({ page }) => {
      const link = page.getByRole(nav.linkRole as 'link', { name: nav.linkName });
      await expect(link.first()).toBeVisible({ timeout: 10_000 });

      const start = performance.now();
      await link.first().click();
      await expect(page).toHaveURL(new RegExp(nav.route.replace('/', '\\/')), { timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      const duration = Math.round(performance.now() - start);
      console.log(`[perf] 导航到 ${nav.route}: ${duration}ms (budget: ${NAV_BUDGET_MS}ms)`);
      expect(duration).toBeLessThan(NAV_BUDGET_MS);
    });
  }
});
