import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}
export function CollapsibleSection({ title, description, defaultOpen = false, icon: Icon, children, className }: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger className={cn('group flex w-full items-center justify-between p-4', 'hover:bg-hover transition-colors cursor-pointer', 'text-left')}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-fg-tertiary shrink-0" />}
          <div className="flex flex-col">
            <span className="text-h3 text-fg">{title}</span>
            {description && <span className="text-caption text-fg-tertiary">{description}</span>}
          </div>
        </div>
        <ChevronDown className={cn('size-4 text-fg-tertiary transition-transform duration-200 shrink-0', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
