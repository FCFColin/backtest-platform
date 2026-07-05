/**
 * @file 参数面板通用组件
 * @description 可折叠分区的参数面板容器，对标 testfol.io 参数区风格。
 * ParamsPanel 为容器组件，ParamsSection 为可折叠分区，支持 info 提示图标。
 * @example
 * <ParamsPanel>
 *   <ParamsSection title="基本参数" info="设置回测的基本参数">
 *     <input ... />
 *   </ParamsSection>
 *   <ParamsSection title="高级设置" defaultOpen={false}>
 *     <input ... />
 *   </ParamsSection>
 * </ParamsPanel>
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';

/** ParamsSection 组件 Props */
export interface ParamsSectionProps {
  /** 分区标题 */
  title: string;
  /** 信息提示文本（显示为 ℹ️ 图标的 tooltip） */
  info?: string;
  /** 分区内容 */
  children: ReactNode;
  /** 初始是否展开，默认 true */
  defaultOpen?: boolean;
}

/**
 * 可折叠参数分区
 *
 * - 标题栏可点击折叠/展开，左侧显示 ▼/▶ 箭头
 * - 标题旁可选 ℹ️ 图标，hover 时显示 info 文本的 tooltip
 */
export function ParamsSection({ title, info, children, defaultOpen = true }: ParamsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between cursor-pointer py-3 px-2"
        onClick={() => setOpen(!open)}
        style={{ userSelect: 'none' }}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          )}
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
            {title}
          </span>
        </div>
        {/* info 图标 + tooltip */}
        {info && (
          <div
            className="relative group"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex' }}
          >
            <Info className="w-4 h-4 cursor-help" style={{ color: 'var(--text-muted)' }} />
            <div
              className="absolute right-0 top-6 hidden group-hover:block z-10"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-control)',
                padding: '8px 12px',
                boxShadow: 'var(--shadow-md)',
                fontSize: '12px',
                color: 'var(--text-body)',
                width: '240px',
                whiteSpace: 'normal',
                lineHeight: '1.5',
              }}
            >
              {info}
            </div>
          </div>
        )}
      </div>
      {/* 内容区 */}
      {open && <div className="px-2 pb-4">{children}</div>}
    </div>
  );
}

/** ParamsPanel 组件 Props */
export interface ParamsPanelProps {
  /** 由多个 ParamsSection 组成的参数内容 */
  children: ReactNode;
}

/**
 * 参数面板容器
 *
 * 垂直排列多个 ParamsSection，自身不滚动（由父容器控制滚动）。
 */
export function ParamsPanel({ children }: ParamsPanelProps) {
  return <div className="flex flex-col">{children}</div>;
}
