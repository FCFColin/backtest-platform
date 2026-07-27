#!/usr/bin/env node
/**
 * verify-backtest-contract.mjs — 后端回测数据契约验证脚本 (P0-0-3)
 *
 * 调用 /api/v1/backtest/portfolio，用 VTI 60% + BND 40% 从 2010-01-01 到 2024-12-31 的经典组合，
 * 验证返回值在合理范围（CAGR 应为小数比率、MaxDrawdown 应为负小数比率、字段完整）。
 *
 * 用法：node scripts/verify-backtest-contract.mjs
 * 退出码：0=PASS，1=FAIL
 * 环境变量：API_URL（默认 http://localhost:15001）
 */
const API = process.env.API_URL ?? 'http://localhost:15001';

const body = {
  portfolios: [
    {
      id: 'test-60-40',
      name: '60/40',
      assets: [
        { ticker: 'VTI', weight: 60 },
        { ticker: 'BND', weight: 40 },
      ],
      rebalanceFrequency: 'quarterly',
      totalReturn: true,
    },
  ],
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  currency: 'USD',
};

try {
  const res = await fetch(`${API}/api/v1/backtest/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          status: 'FAIL',
          httpStatus: res.status,
          error: `HTTP ${res.status}`,
          body: text.slice(0, 500),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const data = await res.json();

  const stats = data?.data?.portfolios?.[0]?.stats;
  const portfolio = data?.data?.portfolios?.[0];
  const assertions = {
    hasStats: !!stats,
    cagrInRange: stats?.cagr >= 0.03 && stats?.cagr <= 0.15,
    cagrIsSmallNumber: typeof stats?.cagr === 'number' && stats?.cagr < 1,
    maxDrawdownInRange:
      typeof stats?.maxDrawdown === 'number' &&
      stats?.maxDrawdown >= -0.6 &&
      stats?.maxDrawdown <= -0.05,
    maxDrawdownIsNegative: typeof stats?.maxDrawdown === 'number' && stats?.maxDrawdown < 0,
    endingValueInRange:
      typeof stats?.endingValue === 'number' &&
      stats?.endingValue >= 15000 &&
      stats?.endingValue <= 60000,
    volatilityReasonable:
      typeof stats?.volatility === 'number' && stats?.volatility > 0.05 && stats?.volatility < 0.3,
    drawdownEpisodesExist:
      Array.isArray(portfolio?.drawdownEpisodes) && portfolio.drawdownEpisodes.length > 0,
    drawdownEpisodeHasAllFields: (() => {
      const ep = portfolio?.drawdownEpisodes?.[0];
      if (!ep) return false;
      return (
        typeof ep.peakDate === 'string' &&
        typeof ep.troughDate === 'string' &&
        typeof ep.depth === 'number' &&
        typeof ep.daysToTrough === 'number' &&
        typeof ep.totalDurationDays === 'number'
      );
    })(),
    growthCurveExists: (portfolio?.growthCurve?.length ?? 0) > 100,
    drawdownCurveExists: (portfolio?.drawdownCurve?.length ?? 0) > 100,
  };

  const failed = Object.entries(assertions).filter(([, v]) => !v);

  const report = {
    timestamp: new Date().toISOString(),
    actual: {
      cagr: stats?.cagr,
      maxDrawdown: stats?.maxDrawdown,
      endingValue: stats?.endingValue,
      volatility: stats?.volatility,
      drawdownEpisodeCount: portfolio?.drawdownEpisodes?.length,
      growthCurvePoints: portfolio?.growthCurve?.length,
      drawdownCurvePoints: portfolio?.drawdownCurve?.length,
      firstDrawdownEpisode: portfolio?.drawdownEpisodes?.[0],
    },
    assertions,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    failedAssertions: failed.map(([k]) => k),
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
} catch (err) {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        status: 'FAIL',
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
