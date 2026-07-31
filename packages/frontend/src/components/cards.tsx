import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface SectionTitleProps {
  icon: ReactNode;
  title: string;
}
export function SectionTitle({ icon, title }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-3.5 text-brand">
      {icon}
      <span className="text-h3 text-fg font-semibold">{title}</span>
    </div>
  );
}
interface PrefRowProps {
  icon: ReactNode;
  label: string;
  desc: string;
  children: ReactNode;
}
export function PrefRow({ icon, label, desc, children }: PrefRowProps) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <div className="text-brand shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-body font-semibold text-fg">{label}</div>
        <div className="text-caption text-fg-tertiary">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </Card>
  );
}
type StatTrend = 'up' | 'down' | 'flat';
interface StatCardProps {
  label: string;
  value: ReactNode;
  trend?: StatTrend;
  trendValue?: string;
  icon?: ReactNode;
  children?: ReactNode;
}
export function StatCard({ label, value, trend, trendValue, icon, children }: StatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendClass = trend === 'up' ? 'text-pos' : trend === 'down' ? 'text-neg' : 'text-fg-tertiary';
  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5 text-caption text-fg-tertiary uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-display text-fg tabular-nums font-mono">{value}</div>
      {(trend || trendValue) && (
        <div className={cn('mt-1.5 flex items-center gap-1 text-label', trendClass)}>
          {trend && <TrendIcon className="size-3.5 shrink-0" />}
          {trendValue && <span>{trendValue}</span>}
        </div>
      )}
      {children}
    </Card>
  );
}
