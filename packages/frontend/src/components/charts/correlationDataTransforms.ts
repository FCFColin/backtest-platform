import { pickByAbsThreshold } from '@/lib/chart-theme';
type GrowthCurvePoint = { date: string; value: number };
export type RollingCorrelationPoint = { date: string; correlation: number };
export type BetaRow = { name: string; beta: number };
export function computeDailyReturns(curve: GrowthCurvePoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0) returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
  }
  return returns;
}
export function computeBeta(baseReturns: number[], targetReturns: number[]): number {
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
export function computeRollingCorrelation(baseReturns: number[], targetReturns: number[], dates: string[], windowSize: number): RollingCorrelationPoint[] {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < windowSize) return [];
  const result: RollingCorrelationPoint[] = [];
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
export function getCorrelationTextColor(val: number): string {
  return pickByAbsThreshold(val, 0.6, '#fff', '#000');
}
