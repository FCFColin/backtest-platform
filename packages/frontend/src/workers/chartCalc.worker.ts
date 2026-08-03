import {
  computeRollingMetric,
  computeRollingExcessReturn,
  computeDailyReturns,
  computeBeta,
  computeRollingCorrelation,
} from '../components/charts/chartUtils.js';
import type { RollingMetricKey } from '../components/charts/chartUtils.js';

type Point = { date: string; value: number };
type TickerData = { ticker: string; dailyReturns: number[]; growthCurve: Point[] };

function buildRollingChartData(
  tickers: TickerData[],
  metric: string,
  windowDays: number,
): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  const isExcess = metric === 'excess';
  const pctMetrics = metric === 'cagr' || metric === 'volatility' || metric === 'excess';
  for (let i = 0; i < tickers.length; i++) {
    const tk = tickers[i];
    const dates = tk.growthCurve.map((g) => g.date).slice(1);
    const rolling = isExcess
      ? i === 0
        ? []
        : computeRollingExcessReturn(tk.dailyReturns, tickers[0].dailyReturns, dates, windowDays)
      : computeRollingMetric(tk.dailyReturns, dates, windowDays, metric as RollingMetricKey);
    for (const p of rolling) {
      if (!dateMap.has(p.date)) dateMap.set(p.date, { date: p.date });
      dateMap.get(p.date)![tk.ticker] = pctMetrics
        ? +(p.value * 100).toFixed(2)
        : +p.value.toFixed(3);
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}

function buildBetaData(
  portfolios: { name: string; growthCurve: Point[] }[],
): { name: string; beta: number }[] {
  if (portfolios.length < 2) return [];
  const baseReturns = computeDailyReturns(portfolios[0].growthCurve);
  return portfolios.slice(1).map((p) => ({
    name: p.name,
    beta: computeBeta(baseReturns, computeDailyReturns(p.growthCurve)),
  }));
}

function buildRollingCorrelationData(
  a: { growthCurve: Point[] },
  b: { growthCurve: Point[] },
  rollingWindow: number,
) {
  return computeRollingCorrelation(
    computeDailyReturns(a.growthCurve),
    computeDailyReturns(b.growthCurve),
    a.growthCurve.slice(1).map((p) => p.date),
    rollingWindow,
  );
}

self.onmessage = (e: MessageEvent<{ id: number; type: string; payload: unknown[] }>) => {
  const { id, type, payload } = e.data;
  try {
    let result: unknown;
    switch (type) {
      case 'computeRollingMetric':
        result = computeRollingMetric(
          payload[0] as number[],
          payload[1] as string[],
          payload[2] as number,
          payload[3] as RollingMetricKey,
        );
        break;
      case 'computeRollingExcessReturn':
        result = computeRollingExcessReturn(
          payload[0] as number[],
          payload[1] as number[],
          payload[2] as string[],
          payload[3] as number,
        );
        break;
      case 'computeBeta':
        result = computeBeta(payload[0] as number[], payload[1] as number[]);
        break;
      case 'computeRollingCorrelation':
        result = computeRollingCorrelation(
          payload[0] as number[],
          payload[1] as number[],
          payload[2] as string[],
          payload[3] as number,
        );
        break;
      case 'computeDailyReturns':
        result = computeDailyReturns(payload[0] as Point[]);
        break;
      case 'buildRollingChartData':
        result = buildRollingChartData(
          payload[0] as TickerData[],
          payload[1] as string,
          payload[2] as number,
        );
        break;
      case 'buildBetaData':
        result = buildBetaData(payload[0] as Parameters<typeof buildBetaData>[0]);
        break;
      case 'buildRollingCorrelationData':
        result = buildRollingCorrelationData(
          payload[0] as Parameters<typeof buildRollingCorrelationData>[0],
          payload[1] as Parameters<typeof buildRollingCorrelationData>[1],
          payload[2] as number,
        );
        break;
      default:
        throw new Error(`Unknown worker task: ${type}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
};
