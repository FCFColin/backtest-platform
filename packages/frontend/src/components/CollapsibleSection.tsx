/**
 * @file CollapsibleSection — 可折叠区块
 * @description 基于 shadcn Collapsible（Radix）的可折叠分区，
 *   带标题、可选描述、可选图标与旋转 chevron。
 */
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  /** 区块标题 */
  title: string;
  /** 可选描述 */
  description?: string;
  /** 是否默认展开，默认 false */
  defaultOpen?: boolean;
  /** 可选 lucide 图标 */
  icon?: LucideIcon;
  /** 区块内容 */
  children: React.ReactNode;
  /** 附加 className */
  className?: string;
}

/**
 * 可折叠区块组件。
 * @param props - 见 CollapsibleSectionProps
 * @returns 渲染的可折叠区块
 */
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
          'text-left'
        )}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-fg-tertiary shrink-0" />}
          <div className="flex flex-col">
            <span className="text-h3 text-fg">{title}</span>
            {description && (
              <span className="text-caption text-fg-tertiary">{description}</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'size-4 text-fg-tertiary transition-transform duration-200 shrink-0',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
