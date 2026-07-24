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
import { Card } from '@/components/ui/card';

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
 * 纵向单列布局：参数区域在上，结果区域在下，均为卡片样式。
 * afterParams 可在参数卡片和结果卡片之间插入额外独立卡片。
 * @param props - params/results/afterParams/title/actions。
 * @returns 工具页面布局元素。
 */
export function ToolPageLayout({
  params,
  results,
  afterParams,
  title,
  actions,
}: ToolPageLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <Card className="p-5">
        {title && (
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-body font-semibold text-fg">{title}</h2>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        <div className="w-full">{params}</div>
      </Card>

      {afterParams}

      {results && (
        <Card className="p-5">
          <div className="w-full">{results}</div>
        </Card>
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

/**
 * 工具页面 SEO 描述卡片：副标题、描述段落、特性列与相关工具链接。
 * @param props - subtitle/desc/features/related/relatedLabel。
 * @returns SEO 卡片元素。
 */
export function ToolSeoCard({ subtitle, desc, features, related, relatedLabel }: ToolSeoCardProps) {
  const { t } = useTranslation();

  const renderDesc = () => {
    if (typeof desc === 'string') {
      return desc
        .split('\n\n')
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="mb-3 text-body leading-relaxed text-fg-secondary last:mb-5">
            {paragraph}
          </p>
        ));
    }
    return <div className="mb-5 text-body leading-relaxed text-fg-secondary">{desc}</div>;
  };

  return (
    <Card className="mb-3 p-5">
      {subtitle && <h2 className="mb-3 text-h3 font-medium text-fg-secondary">{subtitle}</h2>}
      {renderDesc()}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-fg">
              <Check className="size-3.5 shrink-0 text-success" />
              {feature.title}
            </div>
            <div className="text-label leading-relaxed text-fg-tertiary">{feature.desc}</div>
          </div>
        ))}
        {related && related.length > 0 && (
          <div className="min-w-0">
            <div className="mb-1.5 text-label font-semibold text-fg">
              {relatedLabel ?? t('layout.toolSeoCard.relatedTools')}
            </div>
            <div className="text-label leading-relaxed text-fg-tertiary">
              {related.map((link, i) => (
                <span key={link.href}>
                  {i > 0 && <span className="text-fg-tertiary"> · </span>}
                  <Link
                    to={link.href}
                    className="font-medium text-brand transition-colors duration-150 ease-out-quart hover:text-brand-hover"
                  >
                    {link.title}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
