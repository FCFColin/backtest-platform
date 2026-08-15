export type PlanTier = 'free' | 'pro' | 'pro-plus' | 'enterprise' | 'public';
export const PLAN_BADGES: Record<PlanTier, { label: string; className: string }> = {
  free: { label: 'FREE', className: 'border-brand/40 bg-brand-subtle/8 text-brand' },
  pro: { label: 'PRO', className: 'border-warning/40 bg-warning-subtle/8 text-warning' },
  'pro-plus': { label: 'PRO+', className: 'border-success/40 bg-success-subtle/8 text-success' },
  enterprise: {
    label: 'ENTERPRISE',
    className: 'border-brand/60 bg-brand-subtle/12 text-brand',
  },
  public: { label: 'PUBLIC', className: 'border-fg-tertiary/40 bg-fg-tertiary/8 text-fg-tertiary' },
};
export function planTier(plan: string | null | undefined): PlanTier {
  return plan && plan in PLAN_BADGES ? (plan as PlanTier) : 'free';
}
