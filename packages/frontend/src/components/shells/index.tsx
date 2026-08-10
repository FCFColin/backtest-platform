import type { ReactElement, ReactNode, ComponentType } from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolSeoCard, ToolPageLayout } from '../layout/ToolPageLayout.js';
import { Loader2 } from 'lucide-react';
export function TabFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}
interface PresetButtonProps {
  label: string;
  onClick: () => void;
}
interface SeoFeature {
  titleKey: string;
  descKey: string;
}
interface RelatedTool {
  titleKey: string;
  href: string;
}
export interface ComputeToolConfig<S> {
  titleKey: string;
  seoSubtitleKey?: string;
  seoDescKey?: string;
  seoFeatures?: SeoFeature[];
  relatedTools?: RelatedTool[];
  presets?: (state: S) => PresetButtonProps[];
  params: ComponentType<{ state: S }>;
  results?: ComponentType<{ state: S }>;
  afterParams?: ComponentType<{ state: S }>;
  extra?: ComponentType<{ state: S }>;
  hideParamsTitle?: boolean;
  paramsTitleKey?: string;
  paramsTitle?: string;
  hidePageTitle?: boolean;
}
interface StandardPageConfig {
  titleKey: string;
  headerExtra?: ReactNode;
}
export function StandardPageShell({
  config,
  children,
}: {
  config: StandardPageConfig;
  children?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="page-title-slim">{t(config.titleKey)}</h1>
        {config.headerExtra}
      </div>
      {children}
    </div>
  );
}
function PageHeaderActions({
  showAbout,
  showRelated,
  onToggle,
  t,
}: {
  showAbout: boolean;
  showRelated: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="page-header-actions ml-auto">
      {(showAbout || showRelated) && (
        <button className="text-link-subtle" onClick={onToggle}>
          {showAbout ? t('About') : t('Related Tools:')}
        </button>
      )}
    </div>
  );
}
function PresetButton({ label, onClick }: PresetButtonProps) {
  return (
    <button className="preset-chip" onClick={onClick}>
      {label}
    </button>
  );
}
function PresetsCard({ presets }: { presets: PresetButtonProps[] }) {
  const { t } = useTranslation();
  return (
    <div className="preset-chips">
      <span className="preset-label">{t('Presets')}:</span>
      {presets.map((preset) => (
        <PresetButton key={preset.label} label={preset.label} onClick={preset.onClick} />
      ))}
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
  const [seoExpanded, setSeoExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setTimeout(() => setReady(true), 0);
  }, []);
  const Params = config.params;
  const Results = config.results;
  const AfterParams = config.afterParams;
  const Extra = config.extra;
  const presetButtons = config.presets?.(state);
  const paramsTitle = config.hideParamsTitle
    ? undefined
    : (config.paramsTitle ?? t(config.paramsTitleKey ?? 'params.basicParams'));
  return (
    <div className="bt-page">
      <div className="page-header-slim">
        <div className="page-header-title-row">
          {!config.hidePageTitle && <h1 className="page-title-slim">{t(config.titleKey)}</h1>}
          {config.seoSubtitleKey && (
            <span className="page-subtitle-inline">{t(config.seoSubtitleKey)}</span>
          )}
          <PageHeaderActions
            showAbout={!!config.seoDescKey}
            showRelated={!!config.relatedTools && config.relatedTools.length > 0}
            onToggle={() => setSeoExpanded((v) => !v)}
            t={t}
          />
        </div>
        {seoExpanded && config.seoDescKey && (
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
      </div>
      {presetButtons && <PresetsCard presets={presetButtons} />}
      {ready ? (
        <ToolPageLayout
          title={paramsTitle}
          params={<Params state={state} />}
          afterParams={AfterParams ? <AfterParams state={state} /> : undefined}
          results={Results ? <Results state={state} /> : undefined}
        />
      ) : (
        <div style={{ minHeight: 400 }} />
      )}
      {ready && Extra && <Extra state={state} />}
    </div>
  );
}
