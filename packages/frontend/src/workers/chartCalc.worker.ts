const TRADING_DAYS_PER_YEAR = 252;

function stats(w: number[]) {
  const n = w.length;
  const mean = w.reduce((s, r) => s + r, 0) / n;
  const variance = n > 1 ? w.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, variance, stdev: Math.sqrt(variance), n };
}

function calcCagr(window: number[], windowDays: number): number {
  let cumProd = 1;
  for (const r of window) cumProd *= 1 + r;
  return Math.pow(cumProd, TRADING_DAYS_PER_YEAR / windowDays) - 1;
}

function calcVolatility(window: number[]): number {
  return stats(window).stdev * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calcSkewness(window: number[]): number {
  const { mean, stdev, n } = stats(window);
  if (stdev === 0) return 0;
  return (n / ((n - 1) * (n - 2))) * window.reduce((s, r) => s + ((r - mean) / stdev) ** 3, 0);
}

function calcKurtosis(window: number[]): number {
  const { mean, stdev, n } = stats(window);
  if (n < 4 || stdev === 0) return 0;
  const sumFourth = window.reduce((s, r) => s + ((r - mean) / stdev) ** 4, 0);
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sumFourth -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  );
}

function calcKelly(window: number[]): number {
  const { mean, variance } = stats(window);
  return variance > 0 ? mean / variance : 0;
}

const METRIC_CALCULATORS: Record<string, (w: number[], wd: number) => number> = {
  cagr: calcCagr,
  volatility: (w) => calcVolatility(w),
  skewness: (w) => calcSkewness(w),
  kurtosis: (w) => calcKurtosis(w),
  kelly: (w) => calcKelly(w),
};

type Point = { date: string; value: number };

function computeRollingMetric(
  dailyReturns: number[],
  dates: string[],
  windowDays: number,
  metric: string,
): Point[] {
  if (dailyReturns.length < windowDays) return [];
  const calc = METRIC_CALCULATORS[metric];
  if (!calc) return [];
  const result: Point[] = [];
  for (let i = windowDays; i <= dailyReturns.length; i++) {
    if (i >= dates.length) continue;
    result.push({ date: dates[i], value: calc(dailyReturns.slice(i - windowDays, i), windowDays) });
  }
  return result;
}

function computeRollingExcessReturn(
  dailyReturns: number[],
  benchmarkDailyReturns: number[],
  dates: string[],
  windowDays: number,
): Point[] {
  const n = Math.min(dailyReturns.length, benchmarkDailyReturns.length);
  if (n < windowDays) return [];
  const result: Point[] = [];
  const years = windowDays / TRADING_DAYS_PER_YEAR;
  for (let i = windowDays; i <= n; i++) {
    if (i >= dates.length) continue;
    let cumAsset = 1,
      cumBench = 1;
    for (let j = i - windowDays; j < i; j++) {
      cumAsset *= 1 + dailyReturns[j];
      cumBench *= 1 + benchmarkDailyReturns[j];
    }
    result.push({
      date: dates[i],
      value: Math.pow(cumAsset, 1 / years) - Math.pow(cumBench, 1 / years),
    });
  }
  return result;
}

function computeDailyReturns(curve: Point[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0)
      returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
  }
  return returns;
}

function computeBeta(baseReturns: number[], targetReturns: number[]): number {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < 2) return 0;
  const xMean = baseReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const yMean = targetReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let ssXY = 0,
    ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (baseReturns[i] - xMean) * (targetReturns[i] - yMean);
    ssXX += (baseReturns[i] - xMean) ** 2;
  }
  return ssXX > 0 ? ssXY / ssXX : 0;
}

function computeRollingCorrelation(
  baseReturns: number[],
  targetReturns: number[],
  dates: string[],
  windowSize: number,
): { date: string; correlation: number }[] {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < windowSize) return [];
  const result: { date: string; correlation: number }[] = [];
  const step = Math.max(1, Math.floor((n - windowSize) / 200));
  for (let start = 0; start + windowSize <= n; start += step) {
    const xSlice = baseReturns.slice(start, start + windowSize);
    const ySlice = targetReturns.slice(start, start + windowSize);
    const xMean = xSlice.reduce((s, v) => s + v, 0) / windowSize;
    const yMean = ySlice.reduce((s, v) => s + v, 0) / windowSize;
    let ssXY = 0,
      ssXX = 0,
      ssYY = 0;
    for (let i = 0; i < windowSize; i++) {
      const dx = xSlice[i] - xMean,
        dy = ySlice[i] - yMean;
      ssXY += dx * dy;
      ssXX += dx * dx;
      ssYY += dy * dy;
    }
    const corr = ssXX > 0 && ssYY > 0 ? ssXY / Math.sqrt(ssXX * ssYY) : 0;
    result.push({ date: dates[start + windowSize - 1] || '', correlation: +corr.toFixed(4) });
  }
  return result;
}

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
      : computeRollingMetric(tk.dailyReturns, dates, windowDays, metric);
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
          payload[3] as string,
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
