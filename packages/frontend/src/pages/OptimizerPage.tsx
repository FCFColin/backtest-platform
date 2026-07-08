import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ToolPageLayout } from '../components/layout/ToolPageLayout.js';
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
      <div className="bt-seo-card card">
        <p className="bt-seo-desc">{t('optimizer.seoDesc')}</p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">{t('optimizer.seoObjective')}</div>
            <div className="bt-seo-feature-desc">{t('optimizer.seoObjectiveDesc')}</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">{t('optimizer.seoOutput')}</div>
            <div className="bt-seo-feature-desc">{t('optimizer.seoOutputDesc')}</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">{t('optimizer.relatedTools')}</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
            {t('nav.portfolioBacktest')}
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
            {t('nav.efficientFrontier')}
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
            {t('nav.assetAnalysis')}
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
            {t('nav.monteCarlo')}
          </Link>
        </div>
      </div>
      <ToolPageLayout
        title={t('params.title')}
        params={<OptimizerParams s={s} />}
        results={<OptimizerResults s={s} />}
      />
    </div>
  );
}
