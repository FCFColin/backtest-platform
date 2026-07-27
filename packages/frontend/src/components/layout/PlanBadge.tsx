/**
 * @file PlanBadge 组件
 * @description 显示用户订阅计划等级的徽章。4 种 tier：free / pro / pro-plus / public。
 *   使用 text-micro 字号 + uppercase tracking-wider + rounded-full 样式。
 *   每种 tier 对应不同的 border + bg + text 配色。
 */

import { cn } from '@/lib/utils';

/** 用户订阅计划等级 */
export type PlanTier = 'free' | 'pro' | 'pro-plus' | 'public';

interface PlanBadgeProps {
  /** 订阅等级 */
  tier: PlanTier;
  /** 额外样式类 */
  className?: string;
}

/** 各 tier 的边框 + 背景 + 文字色 */
const TIER_STYLES: Record<PlanTier, string> = {
  free: 'border-brand/40 bg-brand-subtle/8 text-brand',
  pro: 'border-warning/40 bg-warning-subtle/8 text-warning',
  'pro-plus': 'border-success/40 bg-success-subtle/8 text-success',
  public: 'border-fg-tertiary/40 bg-fg-tertiary/8 text-fg-tertiary',
};

/** 各 tier 的显示标签 */
const TIER_LABELS: Record<PlanTier, string> = {
  free: 'FREE',
  pro: 'PRO',
  'pro-plus': 'PRO+',
  public: 'PUBLIC',
};

/**
 * 订阅计划等级徽章。
 * @param props - tier（订阅等级）+ className（额外样式）。
 * @returns 圆角徽章元素。
 */
export function PlanBadge({ tier, className }: PlanBadgeProps) {
  return (
    <span
      data-testid="plan-badge"
      className={cn(
        'inline-flex items-center px-1.5 py-0.5',
        'text-micro font-semibold uppercase tracking-wider',
        'border rounded-full',
        TIER_STYLES[tier],
        className,
      )}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
