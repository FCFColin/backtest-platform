/**
 * @file 工具页面通用布局
 * @description 左侧参数面板 + 右侧结果面板的双栏布局。
 * 桌面端（>768px）左右分栏，左侧 360px 可折叠；移动端（≤768px）上下布局。
 * 所有样式使用 Tailwind class + CSS 变量，不使用内联 style。
 * @example
 * <ToolPageLayout
 *   title="组合回测"
 *   params={<ParamsPanel>...</ParamsPanel>}
 *   results={<div>结果内容</div>}
 * />
 */
import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ToolPageLayoutProps {
  params: ReactNode;
  results: ReactNode;
  title?: string;
  defaultMobileParamsOpen?: boolean;
}

/**
 * 工具页面通用布局组件。
 * 所有样式通过 Tailwind class + CSS 变量实现，便于全局主题统一和缓存友好。
 */
export function ToolPageLayout({
  params,
  results,
  title,
  defaultMobileParamsOpen = true,
}: ToolPageLayoutProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(defaultMobileParamsOpen);

  return (
    <div className="flex flex-col md:flex-row w-full min-h-[calc(100vh-100px)]">
      {/* 桌面端参数面板 */}
      <aside
        className={`hidden md:flex flex-col bg-[var(--bg-elevated)] border-[var(--border-soft)] transition-all duration-200 ${
          collapsed ? 'w-0 min-w-0 overflow-hidden border-r-0' : 'w-[360px] min-w-[360px] border-r'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
          {title && (
            <span className="text-base font-semibold text-[var(--text-strong)]">{title}</span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center rounded w-7 h-7 text-[var(--text-muted)] bg-transparent border-none cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
            title={t('layout.toolPageLayout.collapseParams')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{params}</div>
      </aside>

      {/* 折叠后的展开按钮 */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="hidden md:flex items-center justify-center w-8 bg-[var(--bg-elevated)] border-r border-[var(--border-soft)] text-[var(--text-muted)] border-none cursor-pointer"
          title={t('layout.toolPageLayout.expandParams')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* 移动端参数面板 */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex items-center gap-2 w-full px-4 py-3 bg-[var(--bg-header)] border-b border-[var(--border-soft)] text-[var(--text-strong)] font-medium text-sm border-none cursor-pointer"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${mobileOpen ? '' : '-rotate-90'}`}
          />
          {title ?? t('layout.toolPageLayout.defaultParamsTitle')}
        </button>
        {mobileOpen && (
          <div className="p-4 bg-[var(--bg-elevated)] border-b border-[var(--border-soft)]">
            {params}
          </div>
        )}
      </div>

      {/* 结果面板 */}
      <main className="flex-1 min-w-0 overflow-y-auto p-4">{results}</main>
    </div>
  );
}
