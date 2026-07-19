import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useOptimizerState } from './OptimizerUtils.js';
import { OptimizerParams } from './OptimizerParams.js';
import { OptimizerResults } from './OptimizerResults.js';

export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('optimizer.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('optimizer.seoDesc')}
        features={[
          { title: t('optimizer.seoObjective'), desc: t('optimizer.seoObjectiveDesc') },
          { title: t('optimizer.seoOutput'), desc: t('optimizer.seoOutputDesc') },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
          { title: t('nav.assetAnalysis'), href: '/analysis' },
          { title: t('nav.monteCarlo'), href: '/monte-carlo' },
        ]}
        relatedLabel={t('optimizer.relatedTools')}
      />
      <ToolPageLayout
        title={t('params.title')}
        params={<OptimizerParams s={s} />}
        results={<OptimizerResults s={s} />}
      />
    </div>
  );
}
