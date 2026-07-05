import { CHART_COLORS } from '@backtest/shared/types';
import type { GoalAsset } from './types.js';

export function fmtDollar(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

export function getProbColor(prob: number | undefined): string {
  if (prob === undefined) return 'var(--text-strong)';
  if (prob >= 0.7) return 'var(--success)';
  if (prob >= 0.4) return CHART_COLORS[1];
  return 'var(--error)';
}

export function validateGoalInputs(
  validAssets: GoalAsset[],
  totalWeight: number,
  targetAmount: number,
  initialAmount: number,
  years: number,
): string | null {
  if (validAssets.length === 0) return '请至少添加一个标的';
  if (totalWeight !== 100) return '权重合计必须为 100%';
  if (targetAmount <= 0 || initialAmount <= 0 || years <= 0)
    return '目标金额、初始金额、时间范围必须为正数';
  return null;
}
