import { type GridParamRange } from '@backtest/shared';
import { fmtPct, fmtNum } from '@/utils/format';
import { interpolateHsl } from '@/lib/chart-theme';
export type IndicatorType = 'sma' | 'ema' | 'rsi';
export type ObjectiveType = 'maxCAGR' | 'minDrawdown' | 'maxSharpe';
export type { GridParamRange };
export interface GridCombinationMetrics {
  param1: number;
  param2: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  totalReturn: number;
  stdev: number;
  calmar: number;
}
export interface TopCombinationResult extends GridCombinationMetrics {
  growthCurve: Array<{ date: string; value: number }>;
}
export interface HeatmapData {
  param1Label: string;
  param2Label: string;
  param1Values: number[];
  param2Values: number[];
  matrix: (number | null)[][];
  objective: ObjectiveType;
}
export interface TacticalGridResponse {
  totalCombinations: number;
  allMetrics: GridCombinationMetrics[];
  topResults: TopCombinationResult[];
  heatmap: HeatmapData;
  bestCombination: TopCombinationResult;
}
export const OBJECTIVE_OPTIONS: Array<{ value: ObjectiveType; label: string }> = [
  { value: 'maxCAGR', label: 'tacticalGrid.objectives.maxCAGR' },
  { value: 'minDrawdown', label: 'tacticalGrid.objectives.minDrawdown' },
  { value: 'maxSharpe', label: 'tacticalGrid.objectives.maxSharpe' },
];
export function getParamLabelKeys(indicator: IndicatorType): { p1: string; p2: string } {
  if (indicator === 'rsi') {
    return {
      p1: 'tacticalGrid.paramLabels.rsiPeriod',
      p2: 'tacticalGrid.paramLabels.oversoldThreshold',
    };
  }
  return {
    p1: 'tacticalGrid.paramLabels.period',
    p2: 'tacticalGrid.paramLabels.breakoutThreshold',
  };
}
export function getHeatmapColor(value: number, min: number, max: number): string {
  return interpolateHsl(value, min, max, { equalDefault: 'hsl(60, 70%, 50%)' });
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
export function getObjectiveLabelKey(objective: ObjectiveType): string {
  if (objective === 'maxCAGR') return 'tacticalGrid.objectiveLabels.maxCAGR';
  if (objective === 'minDrawdown') return 'tacticalGrid.objectiveLabels.minDrawdown';
  return 'tacticalGrid.objectiveLabels.maxSharpe';
}
export function getCellDisplayValue(cell: number, objective: ObjectiveType): string {
  if (objective === 'minDrawdown') return fmtPct(-cell);
  if (objective === 'maxCAGR') return fmtPct(cell);
  return fmtNum(cell, 2);
}
export function validateGridParams(
  ticker: string,
  param1: GridParamRange,
  param2: GridParamRange,
): string | null {
  if (!ticker.trim()) return 'tacticalGrid.validateErrors.emptyTicker';
  if (param1.step <= 0 || param2.step <= 0) return 'tacticalGrid.validateErrors.invalidStep';
  if (param1.min > param1.max || param2.min > param2.max)
    return 'tacticalGrid.validateErrors.minGtMax';
  const total =
    Math.floor((param1.max - param1.min) / param1.step + 1) *
    Math.floor((param2.max - param2.min) / param2.step + 1);
  if (total > 500) return 'tacticalGrid.validateErrors.tooManyCombinations';
  return null;
}
export function countCombinations(param1: GridParamRange, param2: GridParamRange): number {
  return (
    Math.floor((param1.max - param1.min) / param1.step + 1) *
    Math.floor((param2.max - param2.min) / param2.step + 1)
  );
}
