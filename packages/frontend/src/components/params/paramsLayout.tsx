import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
export interface ParamRowProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}
export function ParamRow({ children, style, className }: ParamRowProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-x-5 gap-y-4', className)} style={style}>
      {children}
    </div>
  );
}
export interface ParamCardProps {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
  className?: string;
}
export function ParamCard({ label, children, fullWidth, style, className }: ParamCardProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full', className)} style={style}>
      {label && <label className="text-caption text-fg-tertiary">{label}</label>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
export interface ParamGroupProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  badge?: number;
}
export function ParamGroup({ title, children, defaultExpanded = true, badge }: ParamGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="mt-3 border-b border-border-subtle last:border-b-0">
      <button type="button" className="flex w-full items-center gap-1.5 py-2.5 px-2 -mx-2 text-left cursor-pointer select-none rounded-md hover:bg-hover transition-colors duration-150" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <ChevronDown className={cn('size-3.5 text-fg-tertiary transition-transform duration-200 shrink-0', !expanded && '-rotate-90')} />
        <span className="text-body font-semibold text-fg">{title}</span>
        {badge !== undefined && badge > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/10 px-1.5 text-caption font-medium text-brand">{badge}</span>}
      </button>
      {expanded && <div className="pb-4 pt-2">{children}</div>}
    </div>
  );
}
