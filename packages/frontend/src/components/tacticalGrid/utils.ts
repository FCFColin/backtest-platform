import type { IndicatorType, ObjectiveType, ParamRange } from './types.js';

export function fmtPct(v: number | undefined | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

export function fmtRatio(v: number | undefined | null): string {
  if (v == null) return '—';
  return v.toFixed(3);
}

export function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v == null) return '—';
  return v.toFixed(digits);
}

export function getParamLabels(indicator: IndicatorType): { p1: string; p2: string } {
  if (indicator === 'rsi') {
    return { p1: 'RSI 周期', p2: '超卖阈值' };
  }
  return { p1: `${indicator.toUpperCase()} 周期`, p2: '突破阈值(%)' };
}

export function getHeatmapColor(value: number, min: number, max: number): string {
  if (min === max) return 'hsl(60, 70%, 50%)';
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = normalized * 120;
  return `hsl(${hue}, 70%, 45%)`;
}

export function getHeatmapTextColor(value: number, min: number, max: number): string {
  if (min === max) return '#000';
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return normalized > 0.5 ? '#fff' : '#000';
}

export function computeHeatmapRange(matrix: (number | null)[][]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of matrix) {
    for (const cell of row) {
      if (cell != null) {
        min = Math.min(min, cell);
        max = Math.max(max, cell);
      }
    }
  }
  return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
}

export function getObjectiveLabel(objective: ObjectiveType): string {
  if (objective === 'maxCAGR') return 'CAGR';
  if (objective === 'minDrawdown') return '回撤(负值)';
  return 'Sharpe';
}

export function getCellDisplayValue(cell: number, objective: ObjectiveType): string {
  if (objective === 'minDrawdown') return fmtPct(-cell);
  if (objective === 'maxCAGR') return fmtPct(cell);
  return fmtNum(cell, 2);
}

export function validateGridParams(
  ticker: string,
  param1: ParamRange,
  param2: ParamRange,
): string | null {
  if (!ticker.trim()) return '请输入标的代码';
  if (param1.step <= 0 || param2.step <= 0) return '步长必须大于 0';
  if (param1.min > param1.max || param2.min > param2.max) return '参数最小值不能大于最大值';
  const total =
    Math.floor((param1.max - param1.min) / param1.step + 1) *
    Math.floor((param2.max - param2.min) / param2.step + 1);
  if (total > 500) return `参数组合过多(${total})，请缩小范围（上限500）`;
  return null;
}
