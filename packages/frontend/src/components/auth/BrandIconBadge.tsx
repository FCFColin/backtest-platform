/**
 * @file 品牌图标徽章
 * @description Auth 页面统一的品牌色圆角图标容器。支持 sm (40×40, radius 10) 与
 *              lg (44×44, radius 12) 两种尺寸，分别对应水平头部与居中头部。
 */
import type { CSSProperties, ReactNode } from 'react';

interface BrandIconBadgeProps {
  /** 图标元素（通常为 lucide-react 图标，如 <LogIn className="w-5 h-5" />） */
  icon: ReactNode;
  /** 徽章尺寸：sm = 40×40/radius 10（水平头部），lg = 44×44/radius 12（居中头部） */
  size?: 'sm' | 'lg';
  /** 追加到基础样式上的内联样式（如居中头部需要的 margin: '0 auto 14px'） */
  style?: CSSProperties;
}

const SIZE_DIMENSIONS: Record<
  'sm' | 'lg',
  { width: number; height: number; borderRadius: number }
> = {
  sm: { width: 40, height: 40, borderRadius: 10 },
  lg: { width: 44, height: 44, borderRadius: 12 },
};

/**
 * 品牌色圆角图标容器。统一 Auth 页面头部图标样式：品牌色背景 + 白色图标 + flex 居中。
 *
 * @param icon - 图标元素
 * @param size - 尺寸变种，默认 'sm'
 * @param style - 追加样式（如居中头部的外边距）
 * @returns 渲染后的徽章 div
 */
export default function BrandIconBadge({ icon, size = 'sm', style }: BrandIconBadgeProps) {
  const dims = SIZE_DIMENSIONS[size];
  return (
    <div
      style={{
        ...dims,
        background: 'var(--brand)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {icon}
    </div>
  );
}
