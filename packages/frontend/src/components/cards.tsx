import * as React from 'react';
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}
export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  icon: Icon,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center justify-between p-4',
          'hover:bg-hover transition-colors cursor-pointer',
          'text-left',
        )}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-fg-tertiary shrink-0" />}
          <div className="flex flex-col">
            <span className="text-h3 text-fg">{title}</span>
            {description && <span className="text-caption text-fg-tertiary">{description}</span>}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'size-4 text-fg-tertiary transition-transform duration-200 shrink-0',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
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
  const trendClass =
    trend === 'up' ? 'text-pos' : trend === 'down' ? 'text-neg' : 'text-fg-tertiary';
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
