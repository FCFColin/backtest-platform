import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolSeoCard } from '../layout/ToolSeoCard.js';
import { ToolPageLayout } from '../layout/ToolPageLayout.js';
import type { ComputeToolConfig, PresetButtonProps } from './types.js';

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

export function ComputeToolShell<S>({
  config,
  state,
}: {
  config: ComputeToolConfig<S>;
  state: S;
}): ReactElement {
  const { t } = useTranslation();
  const Params = config.params;
  const Results = config.results;
  const Extra = config.extra;
  const presetButtons = config.presets?.(state);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t(config.titleKey)}</h1>
      </div>

      {config.seoDescKey && (
        <ToolSeoCard
          desc={t(config.seoDescKey)}
          features={(config.seoFeatures ?? []).map((f) => ({
            title: t(f.titleKey),
            desc: t(f.descKey),
          }))}
          related={config.relatedTools?.map((r) => ({
            title: t(r.titleKey),
            href: r.href,
          }))}
        />
      )}

      {presetButtons && <PresetsCard presets={presetButtons} />}

      <ToolPageLayout
        title={t('params.basicParams')}
        params={<Params state={state} />}
        results={Results ? <Results state={state} /> : undefined}
      />

      {Extra && <Extra state={state} />}
    </div>
  );
}
