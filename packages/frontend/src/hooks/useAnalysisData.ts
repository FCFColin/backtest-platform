import { useMemo } from 'react';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { AssetAnalysisResult } from '@backtest/shared';

function computeSingleBeta(pr: number[], br: number[]): number {
  const len = Math.min(pr.length, br.length);
  if (len < 2) return 0;
  const meanP = pr.slice(0, len).reduce((s, v) => s + v, 0) / len;
  const meanB = br.slice(0, len).reduce((s, v) => s + v, 0) / len;
  let cov = 0,
    varB = 0;
  for (let k = 0; k < len; k++) {
    cov += (pr[k] - meanP) * (br[k] - meanB);
    varB += (br[k] - meanB) ** 2;
  }
  return varB > 0 ? cov / varB : 0;
}

function computeBetaMatrix(allReturns: number[][]): number[][] {
  const n = allReturns.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = i === j ? 1 : computeSingleBeta(allReturns[i], allReturns[j]);
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
        name: tk.ticker,
        growthCurve: tk.growthCurve ?? [],
        drawdownCurve: tk.drawdownCurve ?? [],
        statistics: (tk.statistics ?? {}) as Record<string, number>,
      })),
    [tickers],
  );
}

function useGrowthData(portfolioResults: ReturnType<typeof usePortfolioResults>) {
  return useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const p of portfolioResults)
      for (const point of p.growthCurve) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![p.name] = point.value;
      }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [portfolioResults]);
}

function useDrawdownData(portfolioResults: ReturnType<typeof usePortfolioResults>) {
  return useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const p of portfolioResults)
      for (const point of p.drawdownCurve) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![p.name] = +(point.drawdown * -100).toFixed(2);
      }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [portfolioResults]);
}

export function useAnalysisData(
  results: AssetAnalysisResult,
  correlationWindow: number,
  _rollingWindow: number,
) {
  const tickers = useMemo(() => results.tickers ?? [], [results.tickers]);
  const tickerNames = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  const portfolioResults = usePortfolioResults(tickers);
  const growthData = useGrowthData(portfolioResults);
  const drawdownData = useDrawdownData(portfolioResults);

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

  const annualData = useMemo(() => {
    const yearMap = new Map<number, Record<string, number | number>>();
    for (const tk of tickers)
      for (const point of tk.annualReturns) {
        if (!yearMap.has(point.year)) yearMap.set(point.year, { year: point.year });
        yearMap.get(point.year)![tk.ticker] = +(point.return * 100).toFixed(2);
      }
    return Array.from(yearMap.values()).sort((a, b) => (a.year as number) - (b.year as number));
  }, [tickers]);

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
    drawdownData,
    betaMatrix,
    rollingCorrData,
    annualData,
    scatterData,
  };
}
