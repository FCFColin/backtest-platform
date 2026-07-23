/**
 * @file 参数布局组件集
 * @description 参数表单布局组件：ParamSection / ParamGroup / ParamRow / ParamCard / ActionBar。
 *              合并自原 params/ 目录下 5 个独立文件，减少文件碎片。
 */
import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';

/** ParamRow Props */
export interface ParamRowProps {
  children: ReactNode;
  columns?: number;
  style?: CSSProperties;
  className?: string;
}

/** 参数行组件 - 使用 CSS Grid 横向排列参数卡片 */
export function ParamRow({ children, columns, style, className }: ParamRowProps) {
  const gridStyle = columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined;
  const mergedStyle = { ...gridStyle, ...style };
  return (
    <div className={`param-row ${className || ''}`} style={mergedStyle}>
      {children}
    </div>
  );
}

/** ParamCard Props */
export interface ParamCardProps {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
  className?: string;
}

/** 单个参数卡片组件 */
export function ParamCard({ label, children, fullWidth, style, className }: ParamCardProps) {
  return (
    <div
      className={`param-card ${fullWidth ? 'param-card-full' : ''} ${className || ''}`}
      style={style}
    >
      <label className="param-card-label">{label}</label>
      <div className="param-card-control">{children}</div>
    </div>
  );
}

/** ParamGroup Props */
export interface ParamGroupProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  badge?: number;
}

/** 可折叠参数分组组件 */
export function ParamGroup({ title, children, defaultExpanded = true, badge }: ParamGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="param-group">
      <button
        type="button"
        className="param-group-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown className={`param-group-chevron ${expanded ? 'expanded' : ''}`} />
        <span className="param-group-title">{title}</span>
        {badge !== undefined && badge > 0 && <span className="param-group-badge">{badge}</span>}
      </button>
      {expanded && <div className="param-group-body">{children}</div>}
    </div>
  );
}

/** ParamSection Props */
export interface ParamSectionProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

/** 参数区域容器组件 */
export function ParamSection({ title, children, actions }: ParamSectionProps) {
  return (
    <section className="param-section">
      <div className="param-section-header">
        <h2 className="param-section-title">{title}</h2>
        {actions && <div className="param-section-actions">{actions}</div>}
      </div>
      <div className="param-section-content">{children}</div>
    </section>
  );
}

/** ActionBar Props */
export interface ActionBarProps {
  /** 主按钮配置（与 children 二选一） */
  primary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  /** 次按钮配置 */
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** 自定义内容（与 primary 二选一） */
  children?: ReactNode;
}

/** 底部操作栏组件 */
export function ActionBar({ primary, secondary, children }: ActionBarProps) {
  return (
    <div className="action-bar">
      {children ? (
        children
      ) : primary ? (
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={primary.onClick}
            disabled={primary.disabled || primary.loading}
          >
            {primary.loading ? '...' : primary.label}
          </button>
          {secondary && (
            <button
              type="button"
              className="btn-secondary"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
