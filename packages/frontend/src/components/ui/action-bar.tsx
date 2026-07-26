/**
 * @file ActionBar 组件
 * @description 工具页面底部 CTA 按钮区域容器。桌面端右下对齐，移动端全宽。
 *   替代各页面散落的 w-full 按钮布局，统一 P0-8 空间紧致化规范。
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ActionBarProps {
  /** 按钮内容（通常为 1-2 个 Button） */
  children: ReactNode;
  /** 额外 className */
  className?: string;
}

/**
 * 工具页 CTA 按钮容器。
 * 桌面端：右下对齐，按钮 min-w-[180px]。
 * 移动端：全宽。
 * @param props - children/className
 * @returns ActionBar 元素
 */
export function ActionBar({ children, className }: ActionBarProps) {
  return (
    <div className={cn('flex justify-end gap-3 border-t border-border-subtle pt-4', className)}>
      {children}
    </div>
  );
}
