/**
 * @file 工具页面通用布局
 * @description 参数区域在上，结果区域在下的纵向单列布局，与 testfol.io 风格一致。
 * 全宽响应式设计，移动端友好。
 * @example
 * <ToolPageLayout
 *   title="组合回测"
 *   params={<ParamsPanel>...</ParamsPanel>}
 *   results={<div>结果内容</div>}
 * />
 */
import type { ReactNode } from 'react';

interface ToolPageLayoutProps {
  params: ReactNode;
  results?: ReactNode;
  title?: string;
  actions?: ReactNode;
}

/**
 * 工具页面通用布局组件。
 * 纵向单列布局：参数区域在上，结果区域在下，均为全宽卡片样式。
 */
export function ToolPageLayout({ params, results, title, actions }: ToolPageLayoutProps) {
  return (
    <div className="tool-page-layout flex flex-col w-full gap-4">
      <section className="card tool-page-params" style={{ borderRadius: 20 }}>
        {title && (
          <h2 className="tool-page-section-title">
            <span>{title}</span>
            {actions && <div className="tool-page-section-title-actions">{actions}</div>}
          </h2>
        )}
        <div className="tool-page-params-content">{params}</div>
      </section>

      {results && (
        <section className="card tool-page-results" style={{ borderRadius: 20 }}>
          <div className="tool-page-results-content">{results}</div>
        </section>
      )}
    </div>
  );
}
