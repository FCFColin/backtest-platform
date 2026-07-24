/**
 * @file 调仓敏感性分析页面
 * @description 对比不同调仓频率对同一投资组合长期表现的影响。
 *   就地重构：移除 ComputeToolShell，采用 ToolPageLayout + Card + 可折叠 ToolSeoCard。
 * @route /rebalancing-sensitivity
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolPageLayout, ToolSeoCard } from '@/components/layout/ToolPageLayout';
import { useRebalancingState } from './rebalancingSensitivityUtils.js';
import { RebalancingSensitivityParamsForm } from './RebalancingSensitivityParamsForm.js';
import { ResultsPanel } from './ResultsPanel.js';

/**
 * RebalancingSensitivityPage: 调仓敏感性分析页面。
 * @returns 渲染的页面元素。
 */
export default function RebalancingSensitivityPage() {
  const { t } = useTranslation();
  const s = useRebalancingState();
  const [seoExpanded, setSeoExpanded] = useState(false);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-display text-fg">{t('rebalancingSensitivity.title')}</h1>
        <button
          type="button"
          onClick={() => setSeoExpanded((v) => !v)}
          className="text-caption font-medium text-brand transition-colors hover:text-brand-hover"
        >
          {t('common.about')}
        </button>
      </div>

      {seoExpanded && (
        <ToolSeoCard
          desc={t('rebalancingSensitivity.seo.desc')}
          features={[
            {
              title: t('rebalancingSensitivity.seo.analyzableTitle'),
              desc: t('rebalancingSensitivity.seo.analyzableDesc'),
            },
            {
              title: t('rebalancingSensitivity.seo.offsetScanTitle'),
              desc: t('rebalancingSensitivity.seo.offsetScanDesc'),
            },
          ]}
          related={[
            { title: t('nav.portfolioBacktest'), href: '/' },
            { title: t('nav.portfolioOptimize'), href: '/optimizer' },
            { title: t('nav.lumpsumVsDca'), href: '/lumpsum-vs-dca' },
          ]}
        />
      )}

      <ToolPageLayout
        title={t('rebalancingSensitivity.params.title')}
        params={<RebalancingSensitivityParamsForm s={s} />}
      />
      <ResultsPanel s={s} />
    </div>
  );
}
