import { useMemo } from 'react';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { AssetAnalysisResult } from '@backtest/shared';
import { mergePortfolioSeries } from '@/utils/format.js';
import { computeBeta } from '@/components/charts/chartUtils.js';
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
function computeRollingCorrelation(
  returns1: number[],
  returns2: number[],
  dates: string[],
  windowDays: number,
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  const n = Math.min(returns1.length, returns2.length);
  if (n < windowDays) return result;
  for (let i = windowDays; i <= n; i++) {
    const r1 = returns1.slice(i - windowDays, i);
    const r2 = returns2.slice(i - windowDays, i);
    const dateIdx = i;
    if (dateIdx >= dates.length) continue;
    const mean1 = r1.reduce((s, v) => s + v, 0) / r1.length;
    const mean2 = r2.reduce((s, v) => s + v, 0) / r2.length;
    let cov = 0,
      var1 = 0,
      var2 = 0;
    for (let j = 0; j < r1.length; j++) {
      const d1 = r1[j] - mean1;
      const d2 = r2[j] - mean2;
      cov += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }
    const corr = var1 > 0 && var2 > 0 ? cov / Math.sqrt(var1 * var2) : 0;
    result.push({ date: dates[dateIdx], value: corr });
  }
  return result;
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
export function useAnalysisData(results: AssetAnalysisResult, correlationWindow: number) {
  const tickers = useMemo(() => results.tickers ?? [], [results.tickers]);
  const tickerNames = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  const portfolioResults = usePortfolioResults(tickers);
  const growthData = useGrowthData(portfolioResults);
  const betaMatrix = useMemo(
    () => computeBetaMatrix(tickers.map((t) => t.dailyReturns)),
    [tickers],
  );
  const rollingCorrData = useMemo(() => {
    if (tickers.length < 2) return [];
    const dates = tickers[0].growthCurve.map((g) => g.date).slice(1);
    const windowDays = Math.round((correlationWindow * TRADING_DAYS_PER_YEAR) / 12);
    return computeRollingCorrelation(
      tickers[0]?.dailyReturns ?? [],
      tickers[1]?.dailyReturns ?? [],
      dates,
      windowDays,
    );
  }, [tickers, correlationWindow]);
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
    rollingCorrData,
    scatterData,
  };
}
