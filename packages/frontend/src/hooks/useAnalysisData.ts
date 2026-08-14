import { useMemo } from 'react';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { AssetAnalysisResult } from '@backtest/shared';
import { mergePortfolioSeries } from '@/utils/format.js';
import { computeBeta, computeRollingCorrelation } from '@/components/charts/chartUtils.js';
function computeBetaMatrix(allReturns: number[][]): number[][] {
  const n = allReturns.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = i === j ? 1 : computeBeta(allReturns[j], allReturns[i]);
    }
  }
  return matrix;
}
function usePortfolioResults(tickers: AssetAnalysisResult['tickers']) {
  return useMemo(
    () =>
      tickers.map((tk) => ({
        id: tk.ticker,
        name: tk.ticker,
        growthCurve: tk.growthCurve ?? [],
        drawdownCurve: tk.drawdownCurve ?? [],
        statistics: (tk.statistics ?? {}) as Record<string, number>,
      })),
    [tickers],
  );
}
function useGrowthData(portfolioResults: ReturnType<typeof usePortfolioResults>) {
  return useMemo(
    () =>
      mergePortfolioSeries(
        portfolioResults,
        (p) => p.growthCurve,
        (pt) => pt.date,
        (pt) => pt.value,
      ),
    [portfolioResults],
  );
}
/**
 * 计算指定标对（pair 为 tickers 索引）的滚动相关系数，供相关关系页选中标对后渲染。
 */
export function computePairRollingCorrelation(
  tickers: AssetAnalysisResult['tickers'],
  pair: [number, number],
  correlationWindow: number,
): Array<{ date: string; value: number }> {
  if (tickers.length < 2) return [];
  const a = tickers[pair[0]];
  const b = tickers[pair[1]];
  if (!a || !b) return [];
  const dates = a.growthCurve.map((g) => g.date).slice(1);
  const windowDays = Math.round((correlationWindow * TRADING_DAYS_PER_YEAR) / 12);
  return computeRollingCorrelation(
    a.dailyReturns ?? [],
    b.dailyReturns ?? [],
    dates,
    windowDays,
    Infinity,
  );
}
export function useAnalysisData(results: AssetAnalysisResult) {
  const tickers = useMemo(() => results.tickers ?? [], [results.tickers]);
  const tickerNames = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  const portfolioResults = usePortfolioResults(tickers);
  const growthData = useGrowthData(portfolioResults);
  const betaMatrix = useMemo(
    () => computeBetaMatrix(tickers.map((t) => t.dailyReturns)),
    [tickers],
  );
  const scatterData = useMemo(
    () =>
      tickers.map((tk) => ({
        name: tk.ticker,
        cagr: +((tk.statistics.cagr ?? 0) * 100).toFixed(2),
      })),
    [tickers],
  );
  return {
    tickers,
    tickerNames,
    portfolioResults,
    growthData,
    betaMatrix,
    scatterData,
  };
}
