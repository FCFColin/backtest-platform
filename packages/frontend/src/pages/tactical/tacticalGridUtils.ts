/**
 * @file 战术网格搜索（Tactical Grid Search）纯函数与常量集合
 * @description 承载类型定义、常量、热力图配色与参数校验等无副作用逻辑，
 *              供 TacticalGridPage / hooks / 子组件共享。
 */
import type { CSSProperties } from 'react';
import type { RebalanceFrequency, GridParamRange } from '@backtest/shared';
import { REBALANCE_FREQUENCIES } from '@backtest/shared';
import { fmtPct, fmtNum } from '@/utils/format';
import { interpolateHsl } from '@/utils/colorScale';

// ===== 类型定义 =====

export type IndicatorType = 'sma' | 'ema' | 'rsi';
export type ObjectiveType = 'maxCAGR' | 'minDrawdown' | 'maxSharpe';

// GridParamRange 已上提到 @backtest/shared/types/tactical（前后端 API 契约一致）。
// 此处仅 re-export 以保持本模块既有导出表面不变；新代码请直接从 shared 导入。
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

// ===== 常量 =====

export const INDICATOR_OPTIONS: Array<{ value: IndicatorType; label: string }> = [
  { value: 'sma', label: 'tactical.indicators.sma' },
  { value: 'ema', label: 'tactical.indicators.ema' },
  { value: 'rsi', label: 'tactical.indicators.rsi' },
];

export const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> =
  REBALANCE_FREQUENCIES.map((value) => ({
    value,
    label: `tactical.rebalanceOptions.${value}`,
  }));

export const OBJECTIVE_OPTIONS: Array<{ value: ObjectiveType; label: string }> = [
  { value: 'maxCAGR', label: 'tacticalGrid.objectives.maxCAGR' },
  { value: 'minDrawdown', label: 'tacticalGrid.objectives.minDrawdown' },
  { value: 'maxSharpe', label: 'tacticalGrid.objectives.maxSharpe' },
];

export const heatmapCellStyle: CSSProperties = {
  padding: '6px 8px',
  textAlign: 'center',
  borderBottom: '1px solid var(--border-soft)',
  borderRight: '1px solid var(--border-soft)',
  fontSize: 11,
};

export const heatmapHeaderStyle: CSSProperties = {
  padding: '6px 8px',
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
  borderRight: '1px solid var(--border-soft)',
  fontSize: 11,
  fontWeight: 600,
  position: 'sticky',
  top: 0,
  background: 'var(--bg-elevated)',
  zIndex: 1,
};

export const heatmapRowHeaderStyle: CSSProperties = {
  padding: '6px 8px',
  color: 'var(--text-strong)',
  fontWeight: 600,
  borderBottom: '1px solid var(--border-soft)',
  borderRight: '1px solid var(--border-soft)',
  background: 'var(--bg-subtle)',
  fontSize: 11,
};

/** 根据指标类型返回参数标签 key */
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

/** 热力图颜色：红 → 黄 → 绿，value 越大越绿 */
export function getHeatmapColor(value: number, min: number, max: number): string {
  return interpolateHsl(value, min, max, { equalDefault: 'hsl(60, 70%, 50%)' });
}

/** 热力图文字颜色：深色背景用白字，浅色背景用黑字 */
export function getHeatmapTextColor(value: number, min: number, max: number): string {
  if (min === max) return '#000';
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return normalized > 0.5 ? '#fff' : '#000';
}

/** 计算热力图矩阵的最小值与最大值（用于颜色映射） */
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

/** 返回目标对应的 i18n label key */
export function getObjectiveLabelKey(objective: ObjectiveType): string {
  if (objective === 'maxCAGR') return 'tacticalGrid.objectiveLabels.maxCAGR';
  if (objective === 'minDrawdown') return 'tacticalGrid.objectiveLabels.minDrawdown';
  return 'tacticalGrid.objectiveLabels.maxSharpe';
}

/** 热力图单元格显示值（按目标决定格式化方式） */
export function getCellDisplayValue(cell: number, objective: ObjectiveType): string {
  if (objective === 'minDrawdown') return fmtPct(-cell);
  if (objective === 'maxCAGR') return fmtPct(cell);
  return fmtNum(cell, 2);
}

/** 校验网格搜索参数，返回错误信息 key 或 null */
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

/** 计算参数组合总数（用于错误提示展示） */
export function countCombinations(param1: GridParamRange, param2: GridParamRange): number {
  return (
    Math.floor((param1.max - param1.min) / param1.step + 1) *
    Math.floor((param2.max - param2.min) / param2.step + 1)
  );
}
