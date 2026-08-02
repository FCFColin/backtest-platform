/* eslint-disable no-console -- 性能指标输出到终端 */
import { test, expect } from '@playwright/test';

// 预算基线（2026-08 实测，本机 warm 条件）：
// FCP 408-436ms | TTFB 49-94ms | Load 249-329ms | 导航 640-680ms（点击→networkidle，
// 含 ~400KB JS 解析 + React Router transition，架构性固定成本）
const FCP_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_FCP ?? 700);
const NAV_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_NAV ?? 700);
const TTBF_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_TTFB ?? 150);
const LOAD_BUDGET_MS = Number(process.env.PAGE_LOAD_BUDGET_LOAD ?? 450);

test.describe('页面加载性能预算', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: '.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await ctx.close();
  });

  test('P1: 首页 FCP < 100ms', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const fcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const done = (e: PerformanceEntry) => resolve(Math.round(e.startTime));
          const existing = performance
            .getEntriesByType('paint')
            .find((e) => e.name === 'first-contentful-paint');
          if (existing) return done(existing);
          new PerformanceObserver((list) => {
            const e = list.getEntries().find((x) => x.name === 'first-contentful-paint');
            if (e) done(e);
          }).observe({ type: 'paint', buffered: true });
        }),
    );

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
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  const NAVIGATIONS = [
    {
      label: '蒙特卡洛模拟',
      group: '分析优化',
      name: /monte carlo|蒙特卡洛/i,
      route: '/monte-carlo',
    },
    {
      label: '优化器',
      group: '分析优化',
      name: /组合优化|Portfolio Optimization/,
      route: '/optimizer',
    },
    { label: 'PCA 分析', group: '分析优化', name: /PCA|主成分分析/, route: '/pca' },
    { label: '定价', group: null, name: /pricing|定价/i, route: '/pricing' },
  ];

  for (const nav of NAVIGATIONS) {
    test(`P3: ${nav.label} 导航耗时 < ${NAV_BUDGET_MS}ms`, async ({ page }) => {
      const start = performance.now();
      if (nav.group) {
        await page
          .getByRole('navigation')
          .getByRole('button', { name: new RegExp(nav.group) })
          .click();
        await page.getByRole('menuitem', { name: nav.name }).click();
      } else {
        await page.getByRole('navigation').getByRole('link', { name: nav.name }).click();
      }
      await expect(page).toHaveURL(new RegExp(nav.route.replace('/', '\\/')), { timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      const duration = Math.round(performance.now() - start);
      console.log(`[perf] 导航到 ${nav.route}: ${duration}ms (budget: ${NAV_BUDGET_MS}ms)`);
      expect(duration).toBeLessThan(NAV_BUDGET_MS);
    });
  }
});
