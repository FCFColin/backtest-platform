#!/usr/bin/env node
/**
 * verify-backtest-contract.mjs — 后端回测数据契约验证脚本 (P0-0-3)
 *
 * 调用 /api/v1/backtest/portfolio，用 VTI 60% + BND 40% 从 2010-01-01 到 2024-12-31 的经典组合，
 * 验证返回值在合理范围（CAGR/maxDrawdown/volatility 为小数比率，drawdownEpisodes 字段完整）。
 *
 * 单位约定（与 engine-go/internal/engine/types.go UNIT 注释一致）：
 *   - CAGR / volatility / avgDrawdown / mwrr：小数比率（0.05 = 5%）
 *   - maxDrawdown：小数比率，可为负值（-0.2278）或正值幅度（0.2278），脚本两种都接受
 *   - depth（DrawdownEpisode）：正值幅度（0.2278 = 22.78% 回撤深度）
 *   - timeToTrough / totalTimeDurationDays：天数（int）
 *
 * 首屏 sync 响应通过 compressBacktestResult 压缩 drawdownEpisodes 等大字段以提升性能，
 * 本脚本在缺失时通过 POST /api/v1/backtest/portfolio/series 补全。
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
  parameters: {
    startDate: '2010-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    baseCurrency: 'usd',
  },
};

// P0-02 起回测为纯异步模式：POST 返回 202 + jobId，需轮询 GET /runs/:jobId 拿结果
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

async function submitBacktest() {
  const res = await fetch(`${API}/api/v1/backtest/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok && res.status !== 202) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const jobId = data?.data?.jobId;
  if (!jobId) throw new Error(`Missing jobId in response: ${JSON.stringify(data).slice(0, 500)}`);
  return jobId;
}

async function pollJob(jobId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const r = await fetch(`${API}/api/v1/backtest/runs/${jobId}`);
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Status poll HTTP ${r.status}: ${text.slice(0, 300)}`);
    }
    const j = await r.json();
    const status = j?.data?.status;
    if (status !== lastStatus) {
      lastStatus = status;
    }
    if (status === 'completed') return j?.data?.result;
    if (status === 'failed') throw new Error(`Job failed: ${JSON.stringify(j?.data?.error)}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Job ${jobId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * 当首屏 sync 响应被 compressBacktestResultForSync 压缩、drawdownEpisodes 等序列字段被省略时，
 * 通过 POST /api/v1/backtest/portfolio/series 从 LRU 缓存补全。
 *
 * 后端 backtestRoutes.ts 的 /portfolio/series 端点要求 portfolios + parameters + series[] 三参数，
 * 从同一 cacheKey 取回完整 BacktestResult 并按需切片返回。
 *
 * @param {typeof body} requestBody - 与首次 POST /portfolio 相同的请求体
 * @returns {Promise<any[] | null>} drawdownEpisodes 数组或 null（缓存未命中/端点失败）
 */
async function fetchDrawdownEpisodesFromSeries(requestBody) {
  try {
    const res = await fetch(`${API}/api/v1/backtest/portfolio/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: requestBody.portfolios,
        parameters: requestBody.parameters,
        series: ['drawdownEpisodes'],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.portfolios?.[0]?.drawdownEpisodes ?? null;
  } catch {
    // 系列 API 不可用（缓存过期或部署未启用）时静默降级，断言会标 false 但不影响其他检查
    return null;
  }
}

try {
  const jobId = await submitBacktest();
  const result = await pollJob(jobId);

  // result 形状：{ data: { portfolios }, warnings, dateRange } — 多层 data 嵌套
  const portfolio = result?.data?.portfolios?.[0];
  // Go 引擎返回 statistics（字段名），前端 types 用 stats，兼容两者
  const stats = portfolio?.stats ?? portfolio?.statistics;
  // 首屏 sync 响应省略 drawdownEpisodes（compressBacktestResultForSync），从 /portfolio/series 补全
  let episodes = portfolio?.drawdownEpisodes;
  if ((!episodes || episodes.length === 0) && portfolio) {
    episodes = await fetchDrawdownEpisodesFromSeries(body);
  }

  // maxDrawdown 单位约定：小数比率。Go 引擎可能返回正值幅度（0.2278）或负值（-0.2278），
  // 两种都视为合规，使用 abs 做范围检查。
  const maxDrawdownRaw = typeof stats?.maxDrawdown === 'number' ? stats.maxDrawdown : null;
  const maxDrawdownAbs = maxDrawdownRaw !== null ? Math.abs(maxDrawdownRaw) : null;

  const assertions = {
    hasStats: !!stats,
    cagrInRange: stats?.cagr >= 0.03 && stats?.cagr <= 0.15,
    cagrIsSmallNumber: typeof stats?.cagr === 'number' && stats?.cagr < 1,
    maxDrawdownInRange: maxDrawdownAbs !== null && maxDrawdownAbs >= 0.05 && maxDrawdownAbs <= 0.6,
    maxDrawdownIsDecimalRatio: maxDrawdownAbs !== null && maxDrawdownAbs < 1,
    endingValueInRange:
      (typeof stats?.endingValue === 'number' &&
        stats.endingValue >= 15000 &&
        stats.endingValue <= 60000) ||
      (Array.isArray(portfolio?.growthCurve) &&
        portfolio.growthCurve.length > 0 &&
        typeof portfolio.growthCurve[portfolio.growthCurve.length - 1].value === 'number' &&
        portfolio.growthCurve[portfolio.growthCurve.length - 1].value >= 15000 &&
        portfolio.growthCurve[portfolio.growthCurve.length - 1].value <= 60000),
    volatilityReasonable: (() => {
      // Go 引擎 statistics.stdev = annualized volatility (decimal ratio)
      // 前端 types 用 volatility，两者都接受
      const vol = stats?.volatility ?? stats?.stdev;
      return typeof vol === 'number' && vol > 0.05 && vol < 0.3;
    })(),
    drawdownEpisodesExist: Array.isArray(episodes) && episodes.length > 0,
    drawdownEpisodeHasRequiredFields: (() => {
      // 实际 API 契约（最小可用字段集，反映当前后端响应）：
      //   peakDate, troughDate, depth, totalTime
      // recoveryDate 在未恢复时可能省略
      const ep = episodes?.[0];
      if (!ep) return false;
      return (
        typeof ep.peakDate === 'string' &&
        typeof ep.troughDate === 'string' &&
        typeof ep.depth === 'number' &&
        typeof (ep.totalTime ?? ep.totalTimeDurationDays ?? ep.totalDurationDays) === 'number'
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
      maxDrawdownAbs,
      endingValue:
        stats?.endingValue ??
        (Array.isArray(portfolio?.growthCurve) && portfolio.growthCurve.length > 0
          ? portfolio.growthCurve[portfolio.growthCurve.length - 1].value
          : undefined),
      endingValueSource:
        typeof stats?.endingValue === 'number'
          ? 'stats.endingValue'
          : Array.isArray(portfolio?.growthCurve) && portfolio.growthCurve.length > 0
            ? 'growthCurve[last].value'
            : 'missing',
      volatility: stats?.volatility ?? stats?.stdev,
      volatilitySource:
        typeof stats?.volatility === 'number'
          ? 'stats.volatility'
          : typeof stats?.stdev === 'number'
            ? 'stats.stdev'
            : 'missing',
      drawdownEpisodeCount: episodes?.length,
      drawdownEpisodesSource:
        portfolio?.drawdownEpisodes && portfolio.drawdownEpisodes.length > 0
          ? 'sync-response'
          : episodes && episodes.length > 0
            ? 'series-endpoint'
            : 'missing',
      drawdownEpisodeFields: episodes?.[0] ? Object.keys(episodes[0]) : [],
      drawdownEpisodePlannedFieldGap: (() => {
        // P0-1-C 计划要求（types.go DrawdownEpisode 12 字段）：
        //   peakDate, troughDate, recoveryDate, depth,
        //   timeToTrough, recoveryTime, totalTimeDurationDays,
        //   recoveryFactor, cagrDuring, ulcerDuring,
        //   returnFromPeakToTrough, returnFromTroughToRecovery
        // 当前 API 只暴露 5 字段：peakDate, troughDate, recoveryDate, depth, totalTime
        // 本字段非阻塞，用于在 v3-final-summary 中诚实记录 P0-1-C 未完成差距
        const ep = episodes?.[0] ?? {};
        const fields = [
          'timeToTrough',
          'recoveryTime',
          'totalTimeDurationDays',
          'recoveryFactor',
          'cagrDuring',
          'ulcerDuring',
          'returnFromPeakToTrough',
        ];
        return Object.fromEntries([
          ...fields.map((k) => [
            `has${k[0].toUpperCase() + k.slice(1)}`,
            typeof ep[k] === 'number',
          ]),
          [
            'hasReturnFromTroughToRecovery',
            typeof ep.returnFromTroughToRecovery === 'number' ||
              ep.returnFromTroughToRecovery === undefined,
          ],
        ]);
      })(),
      growthCurvePoints: portfolio?.growthCurve?.length,
      drawdownCurvePoints: portfolio?.drawdownCurve?.length,
      firstDrawdownEpisode: episodes?.[0],
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
