/**
 * @file 参数布局组件集
 * @description 参数表单布局组件：ParamSection / ParamGroup / ParamRow / ParamCard / ActionBar。
 *   基于 shadcn Card / Collapsible / Button + token 类名，合并自原 params/ 目录下 5 个独立文件。
 */
import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** ParamRow Props */
export interface ParamRowProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * 参数行组件：flex-wrap 横向排列参数卡片，每个字段按内容自然定宽。
 * 取代旧的等宽 Grid（等宽列会把开关/短输入拉伸、造成行间错位）。
 * @param props - 见 ParamRowProps
 * @returns 渲染的参数行
 */
export function ParamRow({ children, style, className }: ParamRowProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-x-5 gap-y-4', className)} style={style}>
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

/**
 * 单个参数卡片：标签 + 控件槽，垂直堆叠。
 * 标签用低对比 caption，控件槽负责自身宽度（避免等宽列拉伸）。
 * @param props - 见 ParamCardProps
 * @returns 渲染的参数卡片
 */
export function ParamCard({ label, children, fullWidth, style, className }: ParamCardProps) {
  return (
    <div
      className={cn('flex flex-col gap-1.5', fullWidth && 'w-full', className)}
      style={style}
    >
      {label && <label className="text-caption text-fg-tertiary">{label}</label>}
      <div className="min-w-0">{children}</div>
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

/**
 * 可折叠参数分组：标题行 + chevron + 可选徽标，点击切换展开。
 * @param props - 见 ParamGroupProps
 * @returns 渲染的可折叠分组
 */
export function ParamGroup({ title, children, defaultExpanded = true, badge }: ParamGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="mt-3 border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 py-2.5 px-2 -mx-2 text-left cursor-pointer select-none rounded-md hover:bg-hover transition-colors duration-150"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            'size-3.5 text-fg-tertiary transition-transform duration-200 shrink-0',
            !expanded && '-rotate-90',
          )}
        />
        <span className="text-body font-semibold text-fg">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/10 px-1.5 text-caption font-medium text-brand">
            {badge}
          </span>
        )}
      </button>
      {expanded && <div className="pb-4 pt-2">{children}</div>}
    </div>
  );
}

/** ParamSection Props */
export interface ParamSectionProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  info?: string;
}

/**
 * 参数区域容器：标题行（含可选操作/信息）+ 内容。
 * @param props - 见 ParamSectionProps
 * @returns 渲染的参数区域
 */
export function ParamSection({ title, children, actions, info }: ParamSectionProps) {
  return (
    <section className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-center justify-between py-2 px-2">
        <div className="flex items-center gap-1.5">
          <span className="text-body font-semibold text-fg">{title}</span>
          {info && (
            <span className="text-caption text-fg-tertiary" title={info}>
              ⓘ
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="px-2 pb-3">{children}</div>
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

/**
 * 底部操作栏：主按钮 + 可选次按钮，或自定义内容。
 * @param props - 见 ActionBarProps
 * @returns 渲染的操作栏
 */
export function ActionBar({ primary, secondary, children }: ActionBarProps) {
  return (
    <div className="flex items-center gap-2 py-2">
      {children ? (
        children
      ) : primary ? (
        <>
          <Button
            type="button"
            variant="primary"
            onClick={primary.onClick}
            disabled={primary.disabled || primary.loading}
          >
            {primary.label}
          </Button>
          {secondary && (
            <Button
              type="button"
              variant="secondary"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
