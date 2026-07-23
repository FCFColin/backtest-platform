/**
 * @file 工具页面通用布局与 SEO 卡片
 * @description 合并自 ToolPageLayout 与 ToolSeoCard。
 *   - ToolPageLayout: 参数区域在上，结果区域在下的纵向单列布局，与 testfol.io 风格一致。
 *     全宽响应式设计，移动端友好。支持在参数卡片和结果卡片之间插入额外独立卡片。
 *   - ToolSeoCard: 工具页面 SEO 描述卡片，展示副标题、描述段落、特性列与相关工具链接。
 * @example
 * <ToolPageLayout
 *   title="Parameters"
 *   params={<div className="flex flex-col">...</div>}
 *   afterParams={<div className="card">Portfolios</div>}
 *   results={<div>结果内容</div>}
 * />
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

// ============ ToolPageLayout ============

interface ToolPageLayoutProps {
  params: ReactNode;
  results?: ReactNode;
  afterParams?: ReactNode;
  title?: string;
  actions?: ReactNode;
}

/**
 * 工具页面通用布局组件。
 * 纵向单列布局：参数区域在上，结果区域在下，均为全宽卡片样式。
 * afterParams 可在参数卡片和结果卡片之间插入额外独立卡片。
 */
export function ToolPageLayout({
  params,
  results,
  afterParams,
  title,
  actions,
}: ToolPageLayoutProps) {
  return (
    <div className="tool-page-layout flex flex-col w-full gap-4">
      <section className="card tool-page-params" style={{ borderRadius: 12 }}>
        {title && (
          <h2 className="tool-page-section-title">
            <span>{title}</span>
            {actions && <div className="tool-page-section-title-actions">{actions}</div>}
          </h2>
        )}
        <div className="tool-page-params-content">{params}</div>
      </section>

      {afterParams}

      {results && (
        <section className="card tool-page-results" style={{ borderRadius: 12 }}>
          <div className="tool-page-results-content">{results}</div>
        </section>
      )}
    </div>
  );
}

// ============ ToolSeoCard ============

interface ToolSeoFeature {
  title: string;
  desc: string;
}

interface ToolSeoRelatedLink {
  title: string;
  href: string;
}

interface ToolSeoCardProps {
  subtitle?: string;
  desc: ReactNode;
  features: ToolSeoFeature[];
  related?: ToolSeoRelatedLink[];
  relatedLabel?: string;
}

export function ToolSeoCard({ subtitle, desc, features, related, relatedLabel }: ToolSeoCardProps) {
  const { t } = useTranslation();

  const renderDesc = () => {
    if (typeof desc === 'string') {
      return desc
        .split('\n\n')
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="bt-seo-desc">
            {paragraph}
          </p>
        ));
    }
    return <div className="bt-seo-desc">{desc}</div>;
  };

  return (
    <div className="bt-seo-card card">
      {subtitle && <h2 className="bt-seo-subtitle">{subtitle}</h2>}
      {renderDesc()}
      <div className="bt-seo-columns">
        {features.map((feature) => (
          <div className="bt-seo-column" key={feature.title}>
            <div className="bt-seo-column-title">
              <Check className="bt-seo-check-icon" size={14} />
              {feature.title}
            </div>
            <div className="bt-seo-column-desc">{feature.desc}</div>
          </div>
        ))}
        {related && related.length > 0 && (
          <div className="bt-seo-column">
            <div className="bt-seo-column-title">
              {relatedLabel ?? t('layout.toolSeoCard.relatedTools')}
            </div>
            <div className="bt-seo-column-desc">
              {related.map((link, i) => (
                <span key={link.href}>
                  {i > 0 && <span className="bt-seo-link-separator"> · </span>}
                  <Link to={link.href} className="bt-seo-link">
                    {link.title}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
