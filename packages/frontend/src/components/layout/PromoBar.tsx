/**
 * @file PromoBar 组件
 * @description 全站顶部公告推广条。支持 dismiss（localStorage 持久化）、
 *   3 种 variant（info/success/warning）、脉冲圆点 + 消息 + CTA 链接 + 关闭按钮。
 *   集成位置：App.tsx 或 MainLayout.tsx 的 Navbar 上方。
 */

import { useState, useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PromoBarProps {
  /** 唯一标识符，用于 localStorage 记录 dismiss 状态 */
  id: string;
  /** 公告消息文本 */
  message: string;
  /** CTA 按钮标签 */
  ctaLabel?: string;
  /** CTA 链接路径 */
  ctaLink?: string;
  /** 视觉变体 */
  variant?: 'info' | 'success' | 'warning';
  /** 是否可关闭，默认 true */
  dismissible?: boolean;
}

/** 各 variant 的背景 + 边框 + 文字色 */
const VARIANT_STYLES = {
  info: 'bg-brand-subtle/8 border-brand/20 text-fg',
  success: 'bg-success-subtle/10 border-success/20 text-fg',
  warning: 'bg-warning-subtle/10 border-warning/20 text-fg',
} as const;

/** 各 variant 的脉冲圆点颜色 */
const DOT_STYLES = {
  info: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
} as const;

/**
 * 全站公告推广条。
 * @param props - id/message/ctaLabel/ctaLink/variant/dismissible。
 * @returns 公告条元素，dismiss 后返回 null。
 */
export function PromoBar({
  id,
  message,
  ctaLabel,
  ctaLink,
  variant = 'info',
  dismissible = true,
}: PromoBarProps) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `promo-dismissed-${id}`;

  useEffect(() => {
    if (localStorage.getItem(storageKey) === '1') {
      setDismissed(true);
    }
  }, [storageKey]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(storageKey, '1');
  };

  if (dismissed) return null;

  return (
    <div className={cn('h-10 border-b flex items-center', VARIANT_STYLES[variant])}>
      <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-center gap-3">
        <span className={cn('w-2 h-2 rounded-full animate-pulse', DOT_STYLES[variant])} />
        <span className="text-body">{message}</span>
        {ctaLabel && ctaLink && (
          <Link
            to={ctaLink}
            className="text-body font-medium text-brand hover:underline flex items-center gap-1"
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="ml-auto p-1 hover:bg-hover rounded-md transition-colors"
            aria-label="Close announcement"
          >
            <X className="h-4 w-4 text-fg-tertiary" />
          </button>
        )}
      </div>
    </div>
  );
}
