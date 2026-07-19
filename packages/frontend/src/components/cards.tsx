/**
 * @file 通用卡片展示组件
 * @description 承载账户/偏好等页面共享的 SectionTitle / PrefRow 两个轻量展示组件
 */
import type { ReactNode } from 'react';

interface SectionTitleProps {
  icon: ReactNode;
  title: string;
}

/** 章节标题（图标 + 标题，brand 色调） */
export function SectionTitle({ icon, title }: SectionTitleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        color: 'var(--brand)',
      }}
    >
      {icon}
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</span>
    </div>
  );
}

interface PrefRowProps {
  icon: ReactNode;
  label: string;
  desc: string;
  children: ReactNode;
}

/** 偏好设置行（图标 + 标签/描述 + 控件槽） */
export function PrefRow({ icon, label, desc, children }: PrefRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={{ color: 'var(--brand)', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
