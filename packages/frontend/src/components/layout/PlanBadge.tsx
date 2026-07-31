import { cn } from '@/lib/utils';
export type PlanTier = 'free' | 'pro' | 'pro-plus' | 'public';
interface PlanBadgeProps {
  tier: PlanTier;
  className?: string;
}
const TIER_STYLES: Record<PlanTier, string> = {
  free: 'border-brand/40 bg-brand-subtle/8 text-brand',
  pro: 'border-warning/40 bg-warning-subtle/8 text-warning',
  'pro-plus': 'border-success/40 bg-success-subtle/8 text-success',
  public: 'border-fg-tertiary/40 bg-fg-tertiary/8 text-fg-tertiary'
};
const TIER_LABELS: Record<PlanTier, string> = {
  free: 'FREE',
  pro: 'PRO',
  'pro-plus': 'PRO+',
  public: 'PUBLIC'
};
export function PlanBadge({ tier, className }: PlanBadgeProps) {
  return (
    <span data-testid="plan-badge" className={cn('inline-flex items-center px-1.5 py-0.5', 'text-micro font-semibold uppercase tracking-wider', 'border rounded-full', TIER_STYLES[tier], className)}>
      {TIER_LABELS[tier]}
    </span>
  );
}
