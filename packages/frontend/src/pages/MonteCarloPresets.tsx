import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface PresetButtonProps {
  label: string;
  onClick: () => void;
}

function PresetButton({ label, onClick }: PresetButtonProps) {
  return (
    <button className="toolbar-btn" onClick={onClick}>
      {label}
    </button>
  );
}

function PresetsCard({ presets }: { presets: PresetButtonProps[] }) {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('monteCarlo.presets')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {presets.map((preset) => (
          <PresetButton key={preset.label} label={preset.label} onClick={preset.onClick} />
        ))}
      </div>
    </div>
  );
}

function MonteCarloSeoCard() {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">{t('monteCarlo.seoDesc')}</p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('monteCarlo.seoSimulatable')}</div>
          <div className="bt-seo-feature-desc">{t('monteCarlo.seoSimulatableDesc')}</div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('monteCarlo.seoOutput')}</div>
          <div className="bt-seo-feature-desc">{t('monteCarlo.seoOutputDesc')}</div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">{t('monteCarlo.relatedTools')}</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.portfolioBacktest')}
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

export { PresetsCard, MonteCarloSeoCard };
