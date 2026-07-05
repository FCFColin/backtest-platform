import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function BacktestSeoCard() {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">{t('backtest.seoDesc')}</p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('backtest.seoModelable')}</div>
          <div className="bt-seo-feature-desc">{t('backtest.seoModelableDesc')}</div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('backtest.seoViewable')}</div>
          <div className="bt-seo-feature-desc">{t('backtest.seoViewableDesc')}</div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">{t('backtest.relatedTools')}</span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.monteCarlo')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.portfolioOptimize')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.efficientFrontier')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.assetAnalysis')}
        </Link>
      </div>
    </div>
  );
}
