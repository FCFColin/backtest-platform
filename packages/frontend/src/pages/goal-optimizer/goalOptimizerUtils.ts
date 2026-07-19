/**
 * @file 目标优化器页面纯函数与类型集合
 */
import type { TFunction } from 'i18next';
import { CHART_COLORS } from '@backtest/shared';

export interface GoalAsset {
  ticker: string;
  weight: number;
}

/** 根据达成概率返回对应颜色（≥0.7 绿、≥0.4 黄、否则红） */
export function getProbColor(prob: number | undefined): string {
  if (prob === undefined) return 'var(--text-strong)';
  if (prob >= 0.7) return 'var(--success)';
  if (prob >= 0.4) return CHART_COLORS[1];
  return 'var(--error)';
}

/** validateGoalInputs 的输入参数集合 */
interface GoalInputs {
  validAssets: GoalAsset[];
  totalWeight: number;
  targetAmount: number;
  initialAmount: number;
  years: number;
  t: TFunction;
}

/** 校验目标优化输入参数，返回错误信息或 null */
export function validateGoalInputs(inputs: GoalInputs): string | null {
  const { validAssets, totalWeight, targetAmount, initialAmount, years, t } = inputs;
  if (validAssets.length === 0) return t('goalOptimizer.errEmptyAssets');
  if (totalWeight !== 100) return t('goalOptimizer.errWeightSum');
  if (targetAmount <= 0 || initialAmount <= 0 || years <= 0)
    return t('goalOptimizer.errPositiveRequired');
  return null;
}
