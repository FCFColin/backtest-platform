import type { TFunction } from 'i18next';
import { getPortfolioColor } from '@/lib/chart-theme.js';
export interface GoalAsset {
  ticker: string;
  weight: number;
}
export function getProbColor(prob: number | undefined): string {
  if (prob === undefined) return 'hsl(var(--fg))';
  if (prob >= 0.7) return 'hsl(var(--success))';
  if (prob >= 0.4) return getPortfolioColor(1);
  return 'hsl(var(--danger))';
}
interface GoalInputs {
  validAssets: GoalAsset[];
  totalWeight: number;
  targetAmount: number;
  initialAmount: number;
  years: number;
  t: TFunction;
}
export function validateGoalInputs(inputs: GoalInputs): string | null {
  const { validAssets, totalWeight, targetAmount, initialAmount, years, t } = inputs;
  if (validAssets.length === 0) return t('Please add at least one ticker');
  if (totalWeight !== 100) return t('Total weight must equal 100%');
  if (targetAmount <= 0 || initialAmount <= 0 || years <= 0)
    return t('Target amount, initial amount, and time range must be positive');
  return null;
}
