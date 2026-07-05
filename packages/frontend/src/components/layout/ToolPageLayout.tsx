/**
 * @file 工具页面通用布局
 * @description 左侧参数面板 + 右侧结果面板的双栏布局，对标 testfol.io 工具页面风格。
 * 桌面端（>768px）左右分栏，左侧 360px 可折叠；移动端（≤768px）上下布局，参数面板可折叠展开。
 * @example
 * <ToolPageLayout
 *   title="组合回测"
 *   params={<ParamsPanel>...</ParamsPanel>}
 *   results={<div>结果内容</div>}
 * />
 */
import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

/** ToolPageLayout 组件 Props */
interface ToolPageLayoutProps {
  /** 左侧参数面板内容 */
  params: ReactNode;
  /** 右侧结果面板内容 */
  results: ReactNode;
  /** 参数面板标题（同时用于移动端折叠按钮文本） */
  title?: string;
  /** 移动端参数面板初始是否展开，默认 true */
  defaultMobileParamsOpen?: boolean;
}

/**
 * 工具页面通用布局组件
 *
 * - 桌面端：左侧 360px 参数面板 + 右侧 flex-1 结果面板，左侧可通过按钮折叠/展开
 * - 移动端：上下布局，参数面板折叠为顶部可展开区域
 * - 使用项目 CSS 变量（var(--bg-elevated) 等）保证主题一致
 */
export function ToolPageLayout({
  params,
  results,
  title,
  defaultMobileParamsOpen = true,
}: ToolPageLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(defaultMobileParamsOpen);

  return (
    <div className="flex flex-col md:flex-row w-full" style={{ minHeight: 'calc(100vh - 100px)' }}>
      <DesktopParamsPanel
        params={params}
        title={title}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="hidden md:flex items-center justify-center"
          style={{
            width: '32px',
            background: 'var(--bg-elevated)',
            borderRight: '1px solid var(--border-soft)',
            color: 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
          title="展开参数面板"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
      <MobileParamsPanel
        params={params}
        title={title}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="flex-1 min-w-0" style={{ overflowY: 'auto', padding: '16px' }}>
        {results}
      </main>
    </div>
  );
}

function DesktopParamsPanel({
  params,
  title,
  collapsed,
  setCollapsed,
}: {
  params: ReactNode;
  title?: string;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  return (
    <aside
      className={`hidden md:flex flex-col ${collapsed ? 'w-0 overflow-hidden' : 'w-[360px] min-w-[360px]'}`}
      style={{
        background: 'var(--bg-elevated)',
        borderRight: collapsed ? 'none' : '1px solid var(--border-soft)',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        {title && (
          <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>
            {title}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex items-center justify-center rounded transition-colors"
          style={{
            width: '28px',
            height: '28px',
            color: 'var(--text-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
          title="折叠参数面板"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{params}</div>
    </aside>
  );
}

function MobileParamsPanel({
  params,
  title,
  mobileOpen,
  setMobileOpen,
}: {
  params: ReactNode;
  title?: string;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="flex items-center gap-2 w-full px-4 py-3"
        style={{
          background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-soft)',
          color: 'var(--text-strong)',
          fontWeight: 500,
          fontSize: '14px',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <ChevronDown
          className="w-4 h-4 transition-transform"
          style={{ transform: mobileOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        {title || '参数设置'}
      </button>
      {mobileOpen && (
        <div
          style={{
            padding: '16px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          {params}
        </div>
      )}
    </div>
  );
}
