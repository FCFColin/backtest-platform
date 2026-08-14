import type { TFunction } from 'i18next';
import pricingData from '@/pages/account/pricing/pricingData.json';

interface PlanFeatureEntry {
  key: string;
  included: boolean;
}
export interface PlanEntry {
  id: 'free' | 'pro' | 'enterprise';
  name: string;
  iconName: string;
  price?: string;
  priceKey?: string;
  period?: string;
  periodKey?: string;
  descKey: string;
  ctaKey: string;
  recommended?: boolean;
  features: PlanFeatureEntry[];
}
export interface ComparisonRowEntry {
  featureKey: string;
  free: string;
  pro: string;
  enterprise: string;
}

const RAW = pricingData as {
  plans: PlanEntry[];
  comparisonRows: ComparisonRowEntry[];
};
const STATIC_SYMBOLS = new Set(['-', '✓']);

export const PLANS = RAW.plans;
export const BILLABLE_PLANS = RAW.plans.filter(
  (p): p is PlanEntry & { id: 'pro' | 'enterprise' } => p.id !== 'free',
);
export const COMPARISON_ROWS = RAW.comparisonRows;

export const planPrice = (p: PlanEntry, t: TFunction): string =>
  p.priceKey ? t(p.priceKey) : (p.price ?? '');
export const planPeriod = (p: PlanEntry, t: TFunction): string =>
  p.periodKey ? t(p.periodKey) : (p.period ?? '');
export const resolveCellValue = (value: string, t: TFunction): string =>
  STATIC_SYMBOLS.has(value) ? value : t(value);
