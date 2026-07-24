/**
 * @file EmptyState — 空状态占位
 * @description 居中展示图标、标题、描述与可选动作，用于列表/结果为空时的占位。
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** 可选 lucide 图标组件 */
  icon?: LucideIcon;
  /** 标题文案 */
  title: string;
  /** 描述文案 */
  description?: string;
  /** 可选操作区（通常放 Button） */
  action?: ReactNode;
  /** 附加 className */
  className?: string;
}

/**
 * 空状态占位组件。
 * @param props - 见 EmptyStateProps
 * @returns 渲染的空状态区块
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      {Icon && <Icon className="size-12 text-fg-tertiary mb-4" />}
      <h2 className="text-h2 text-fg">{title}</h2>
      {description && (
        <p className="text-body text-fg-secondary mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
