/**
 * @file Auth 页面通用布局
 * @description 统一 4 个 auth 页面（Login/Signup/VerifyEmail/AcceptInvite）共享的
 *              页面外壳与卡片结构：bt-page 居中容器 + bt-main-card 卡片 + 标题区 + 底部链接。
 *              支持两种头部布局：水平（icon + h1 在 flex 行内，左对齐）与居中（icon 居中、h1 居中）。
 */
import type { CSSProperties, ReactNode } from 'react';
import { BrandIconBadge } from './formFields.js';

interface AuthPageLayoutProps {
  /** 品牌图标元素。水平布局下自动包裹 <BrandIconBadge size="sm">；居中布局下原样渲染 */
  icon?: ReactNode;
  /** 页面标题（h1 内容） */
  title: ReactNode;
  /** 表单/主体内容 */
  children: ReactNode;
  /** 底部链接区（如"已有账号？登录"），渲染为 muted 居中文字 */
  footer?: ReactNode;
  /** 页面最大宽度，默认 420 */
  maxWidth?: number;
  /** 是否使用居中布局（卡片 textAlign: center，图标在标题上方），默认 false */
  centered?: boolean;
}

/**
 * Auth 页面通用布局容器。
 *
 * - 非居中（默认）：标题区为水平 flex 行（BrandIconBadge + h1），底部 footer 为 muted 居中链接
 * - 居中：卡片 textAlign: center，图标原样渲染于标题上方，h1 在有图标时 marginBottom 8
 *
 * @param icon - 品牌图标元素
 * @param title - 页面标题
 * @param children - 主体内容
 * @param footer - 底部链接内容
 * @param maxWidth - 最大宽度，默认 420
 * @param centered - 是否居中布局，默认 false
 * @returns 渲染后的页面布局
 */
export default function AuthPageLayout({
  icon,
  title,
  children,
  footer,
  maxWidth = 420,
  centered = false,
}: AuthPageLayoutProps) {
  const cardStyle: CSSProperties = centered
    ? { padding: 28, marginTop: 40, textAlign: 'center' }
    : { padding: 28, marginTop: 40 };

  return (
    <div className="bt-page" style={{ maxWidth, margin: '0 auto' }}>
      <div className="bt-main-card card" style={cardStyle}>
        {centered ? (
          <>
            {icon}
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-strong)',
                ...(icon ? { marginBottom: 8 } : {}),
              }}
            >
              {title}
            </h1>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            {icon && <BrandIconBadge icon={icon} />}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
              {title}
            </h1>
          </div>
        )}
        {children}
        {footer && (
          <div
            style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
