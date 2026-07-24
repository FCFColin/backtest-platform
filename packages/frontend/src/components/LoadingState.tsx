/**
 * @file LoadingState — 加载状态占位
 * @description 提供 LoadingState（整块占位）与 LoadingSpinner（可复用 spinner）。
 *   使用 lucide Loader2 + animate-spin。
 */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  /** 图标尺寸（px），默认 24 */
  size?: number;
  /** 附加 className */
  className?: string;
}

/**
 * 可复用的加载 spinner。
 * @param props - 见 LoadingSpinnerProps
 * @returns 渲染的旋转图标
 */
export function LoadingSpinner({ size = 24, className }: LoadingSpinnerProps) {
  return (
    <Loader2
      size={size}
      className={cn('animate-spin text-fg-tertiary', className)}
    />
  );
}

interface LoadingStateProps {
  /** 加载文案 */
  label?: ReactNode;
  /** spinner 尺寸（px），默认 32 */
  size?: number;
  /** 附加 className */
  className?: string;
}

/**
 * 加载状态占位组件，与 EmptyState 同容器结构。
 * @param props - 见 LoadingStateProps
 * @returns 渲染的加载状态区块
 */
export function LoadingState({ label, size = 32, className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      <LoadingSpinner size={size} className="mb-4" />
      {label && <p className="text-body text-fg-secondary">{label}</p>}
    </div>
  );
}
