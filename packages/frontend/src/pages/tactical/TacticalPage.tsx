import { useTranslation } from 'react-i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useTacticalPageState } from './TacticalUtils.js';
import { TacticalParamsPanel } from './TacticalParams.js';
import { TacticalResultsPanel } from './TacticalResults.js';

export default function TacticalPage() {
  const { t } = useTranslation();
  const state = useTacticalPageState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('tactical.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('tactical.seo.desc')}
        features={[
          {
            title: t('tactical.seo.configurableTitle'),
            desc: t('tactical.seo.configurableDesc'),
          },
          {
            title: t('tactical.seo.viewableTitle'),
            desc: t('tactical.seo.viewableDesc'),
          },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('nav.assetAnalysis'), href: '/analysis' },
          { title: t('nav.portfolioOptimize'), href: '/optimizer' },
        ]}
      />
      <ToolPageLayout
        title={t('tactical.strategyParams')}
        params={<TacticalParamsPanel state={state} />}
        results={<TacticalResultsPanel state={state} />}
      />
    </div>
  );
}
