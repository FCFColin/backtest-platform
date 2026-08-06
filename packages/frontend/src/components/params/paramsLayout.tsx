import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Card } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface ParamRowProps {
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
interface ParamCardProps {
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
interface ParamGroupProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  badge?: number;
}
export function ParamGroup({ title, children, defaultExpanded = true, badge }: ParamGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="mt-3 border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 py-2.5 px-2 -mx-2 text-left cursor-pointer select-none rounded-md hover:bg-hover transition-colors duration-150"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            'size-3.5 text-fg-tertiary transition-transform duration-200 shrink-0',
            !expanded && '-rotate-90',
          )}
        />
        <span className="text-body font-semibold text-fg">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/10 px-1.5 text-caption font-medium text-brand">
            {badge}
          </span>
        )}
      </button>
      {expanded && <div className="pb-4 pt-2">{children}</div>}
    </div>
  );
}
interface ParamsSectionProps {
  title?: string;
  info?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  plain?: boolean;
}
export function ParamsSection({
  title,
  info,
  children,
  defaultOpen = true,
  plain = false,
}: ParamsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn(!plain && 'border-b border-border-subtle')}>
      {title && (
        <div
          role="button"
          tabIndex={0}
          className="flex items-center justify-between cursor-pointer py-2 px-2 select-none"
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(!open);
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            {open ? (
              <ChevronDown className="size-3.5 text-fg-tertiary" />
            ) : (
              <ChevronRight className="size-3.5 text-fg-tertiary" />
            )}
            <span
              className={cn(
                plain
                  ? 'text-label font-medium text-fg-tertiary'
                  : 'text-body font-semibold text-fg',
              )}
            >
              {title}
            </span>
          </div>
          {info && (
            <div
              className="relative inline-flex group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                }
              }}
            >
              <Info className="size-3.5 cursor-help text-fg-tertiary" />
              <div className="absolute right-0 top-6 hidden group-hover:block z-10 w-60 rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">
                {info}
              </div>
            </div>
          )}
        </div>
      )}
      {open && <div className={cn('px-2', plain ? 'pb-2' : 'pb-4')}>{children}</div>}
    </div>
  );
}
export function ParamsPanel({ children }: { children: ReactNode }) {
  return <Card className="flex flex-col p-2">{children}</Card>;
}
