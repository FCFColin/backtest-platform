/**
 * @file 轻量级 Tooltip 原语
 * @description shadcn 风格 API（TooltipProvider/Tooltip/TooltipTrigger/TooltipContent），
 *   基于 Tailwind group-hover 实现，无需额外 Radix 依赖。适合静态 hover 提示场景。
 *   定位：默认在触发元素上方居中（bottom-full + -translate-x-1/2）。
 */
import { forwardRef, isValidElement, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** TooltipProvider：上下文占位（无全局配置需求时透传 children） */
function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Tooltip：定位上下文容器，作为 group 触发 hover/focus 显示 */
function Tooltip({ children }: { children: ReactNode }) {
  return <div className="relative inline-flex group">{children}</div>;
}

interface TooltipTriggerProps {
  children: ReactNode;
  /** 为 true 时直接透传 children（不加 span 包装），由 children 自身作为触发元素 */
  asChild?: boolean;
}

/** TooltipTrigger：触发元素包装器 */
function TooltipTrigger({ children, asChild }: TooltipTriggerProps) {
  if (asChild && isValidElement(children)) {
    return <>{children}</>;
  }
  return <span>{children}</span>;
}

interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** TooltipContent：弹出内容，group-hover 或 group-focus-within 时显示 */
const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  function TooltipContent({ children, className, ...props }, ref) {
    return (
      <div
        ref={ref}
        role="tooltip"
        className={cn(
          'invisible opacity-0 group-hover:visible group-hover:opacity-100',
          'group-focus-within:visible group-focus-within:opacity-100',
          'transition-opacity duration-150',
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
