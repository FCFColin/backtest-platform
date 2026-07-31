import type { BacktestResult, PortfolioResult } from '@backtest/shared/types';

/** 同步首屏响应曲线点数（Summary 页足够） */
export const MAX_SYNC_CHART_POINTS = 400;

const MAX_CHART_POINTS = 800;

const SYNC_OMIT_PORTFOLIO_FIELDS = [
  'allocationHistory',
  'drawdownEpisodes',
  'rollingReturns',
] as const;

type OmitField = (typeof SYNC_OMIT_PORTFOLIO_FIELDS)[number];

function omitPortfolioFields(
  portfolio: PortfolioResult,
  fields: readonly OmitField[],
): PortfolioResult {
  const next = { ...portfolio };
  for (const field of fields) {
    delete (next as Record<string, unknown>)[field];
  }
  return next;
}

function chartSampleIndices(length: number, maxPoints: number): number[] {
  if (length <= maxPoints) {
    return Array.from({ length }, (_, i) => i);
  }
  const indices: number[] = [];
  const step = (length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    indices.push(Math.round(i * step));
  }
  return indices;
}

function downsampleByIndices<T>(arr: T[], indices: number[]): T[] {
  return indices.map((i) => arr[i]);
}

function compressPortfolio(portfolio: PortfolioResult, maxPoints: number): PortfolioResult {
  const growthCurve = portfolio.growthCurve ?? [];
  const n = growthCurve.length;
  if (n <= maxPoints) return portfolio;

  const indices = chartSampleIndices(n, maxPoints);

  return {
    ...portfolio,
    growthCurve: downsampleByIndices(growthCurve, indices),
    drawdownCurve: downsampleByIndices(portfolio.drawdownCurve ?? [], indices),
    rollingReturns: downsampleByIndices(portfolio.rollingReturns ?? [], indices),
    allocationHistory: portfolio.allocationHistory
      ? downsampleByIndices(portfolio.allocationHistory, indices)
      : portfolio.allocationHistory,
    drag: portfolio.drag
      ? {
          ...portfolio.drag,
          dragSeries: downsampleByIndices(portfolio.drag.dragSeries ?? [], indices),
        }
      : portfolio.drag,
  };
}

/**
 * 压缩回测结果中的时间序列，减小 HTTP 响应与前端 JSON 解析开销。
 *
 * @param result - 引擎返回的完整回测结果
 * @param maxPoints - 每条曲线最大点数
 * @returns 降采样后的结果（statistics / correlations 不变）
 */
export function compressBacktestResult(
  result: BacktestResult,
  maxPoints = MAX_CHART_POINTS,
): BacktestResult {
  const portfolios = Array.isArray(result.portfolios) ? result.portfolios : [];
  const compressed: BacktestResult = {
    ...result,
    portfolios: portfolios.map((p) => compressPortfolio(p, maxPoints)),
  };

  if (result.benchmarkGrowth && result.benchmarkGrowth.length > maxPoints) {
    const indices = chartSampleIndices(result.benchmarkGrowth.length, maxPoints);
    compressed.benchmarkGrowth = downsampleByIndices(result.benchmarkGrowth, indices);
  }

  return compressed;
}

/**
 * 同步首屏载荷：400 点曲线 + 省略非首屏 tab 大字段（statistics / annualReturns 等保留）。
 *
 * @param result - 引擎返回的完整回测结果
 * @returns 瘦身后的首屏结果
 */
export function compressBacktestResultForSync(result: BacktestResult): BacktestResult {
  const compressed = compressBacktestResult(result, MAX_SYNC_CHART_POINTS);
  return {
    ...compressed,
    portfolios: compressed.portfolios.map((p) =>
      omitPortfolioFields(p, SYNC_OMIT_PORTFOLIO_FIELDS),
    ),
  };
}

export function extractBacktestSeries(
  result: BacktestResult,
  series: string[],
): Partial<PortfolioResult>[] {
  const want = new Set(series);
  return result.portfolios.map((p) => {
    const slice: Partial<PortfolioResult> & { name: string } = { name: p.name };
    const compressed = compressPortfolio(p, MAX_CHART_POINTS);
    if (want.has('rollingReturns')) slice.rollingReturns = compressed.rollingReturns;
    if (want.has('allocationHistory')) slice.allocationHistory = compressed.allocationHistory;
    if (want.has('drawdownEpisodes')) slice.drawdownEpisodes = p.drawdownEpisodes;
    return slice;
  });
}