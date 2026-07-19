/**
 * @file 通用错误提示横幅
 * @description 统一的错误展示组件：danger 配色 + 软底背景。message 为空时返回 null，
 *              可通过 style 覆盖/追加外边距等布局样式。
 */
import type { CSSProperties, ReactNode } from 'react';

interface ErrorBannerProps {
  /** 错误内容；为 falsy 时不渲染 */
  message: ReactNode;
  /** 追加到基础样式上的内联样式（如 marginTop/marginBottom） */
  style?: CSSProperties;
}

/**
 * 错误提示横幅。message 为空时返回 null，否则渲染 danger 配色的提示块。
 *
 * @param message - 错误内容；为 falsy 时不渲染
 * @param style - 追加到基础样式上的内联样式
 * @returns 渲染后的横幅 div，或 null
 */
export default function ErrorBanner({ message, style }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      style={{
        fontSize: 13,
        color: 'var(--danger, #dc2626)',
        padding: '8px 10px',
        background: 'var(--danger-soft, #fef2f2)',
        borderRadius: 8,
        ...style,
      }}
    >
      {message}
    </div>
  );
}
