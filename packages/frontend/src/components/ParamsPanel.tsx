import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Card } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface ParamsSectionProps {
  title?: string;
  info?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  plain?: boolean;
}
export function ParamsSection({ title, info, children, defaultOpen = true, plain = false }: ParamsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn(!plain && 'border-b border-border-subtle')}>
      {title && (
        <div className="flex items-center justify-between cursor-pointer py-2 px-2 select-none" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown className="size-3.5 text-fg-tertiary" /> : <ChevronRight className="size-3.5 text-fg-tertiary" />}
            <span className={cn(plain ? 'text-label font-medium text-fg-tertiary' : 'text-body font-semibold text-fg')}>{title}</span>
          </div>
          {info && (
            <div className="relative inline-flex group" onClick={(e) => e.stopPropagation()}>
              <Info className="size-3.5 cursor-help text-fg-tertiary" />
              <div className="absolute right-0 top-6 hidden group-hover:block z-10 w-60 rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">{info}</div>
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
