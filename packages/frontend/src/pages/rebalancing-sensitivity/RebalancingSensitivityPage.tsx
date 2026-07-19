/**
 * @file 调仓敏感性分析页面
 * @description 对比不同调仓频率（日/周/月/季/年）对投资组合收益与风险的影响
 * @route /rebalancing-sensitivity
 */
import { useTranslation } from 'react-i18next';
import { useRebalancingState } from './rebalancingSensitivityUtils.js';
import { RebalancingSensitivityParamsForm } from './RebalancingSensitivityParamsForm.js';
import { ResultsPanel } from './ResultsPanel.js';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';

export default function RebalancingSensitivityPage() {
  const { t } = useTranslation();
  const s = useRebalancingState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('rebalancingSensitivity.title')}</h1>
      </div>
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
      <ToolPageLayout
        title={t('rebalancingSensitivity.params.title')}
        params={<RebalancingSensitivityParamsForm s={s} />}
        results={<ResultsPanel s={s} />}
      />
    </div>
  );
}
