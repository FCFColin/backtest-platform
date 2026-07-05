/** @file Optimizer SEO / presets card */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function OptimizerSeoCard() {
  const { t } = useTranslation();
  return (
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
  );
}
