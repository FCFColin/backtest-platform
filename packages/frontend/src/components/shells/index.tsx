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
    <div className="page-container pt-0 pb-3 sm:pb-4">
      <div className="flex justify-between items-start px-1 mb-3">
        <h1 className="text-page-title text-fg shrink-0">{t(config.titleKey)}</h1>
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
    <div className="flex items-center gap-3 shrink-0">
      {(showAbout || showRelated) && (
        <button
          className="text-[13px] text-fg-tertiary no-underline bg-transparent border-none cursor-pointer p-0 transition-colors hover:text-brand"
          onClick={onToggle}
        >
          {showAbout ? t('About') : t('Related Tools:')}
        </button>
      )}
    </div>
  );
}
function PresetButton({ label, onClick }: PresetButtonProps) {
  return (
    <button
      className="text-caption font-medium cursor-pointer whitespace-nowrap rounded border border-border-subtle bg-input-bg text-fg-secondary px-2.5 py-1 transition-all hover:border-brand hover:text-brand"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
function PresetsCard({ presets }: { presets: PresetButtonProps[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-hover rounded-md px-3 py-2 mb-3">
      <span className="text-caption text-fg-tertiary shrink-0">{t('Presets')}:</span>
      {presets.map((preset) => (
        <PresetButton key={preset.label} label={preset.label} onClick={preset.onClick} />
      ))}
    </div>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function createComputeToolPage<S>(
  usePageState: () => S,
  config: ComputeToolConfig<S>,
): React.ComponentType {
  function Page() {
    const state = usePageState();
    return <ComputeToolShell config={config} state={state} />;
  }
  Page.displayName = config.titleKey;
  return Page;
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
  const paramsTitle = config.hideParamsTitle ? undefined : t('params.basicParams');
  return (
    <div className="page-container pt-0 pb-3 sm:pb-4">
      <div className="border-b border-border-subtle pt-3 pb-2.5 mb-3">
        <div className="flex items-baseline gap-4">
          {!config.hidePageTitle && (
            <h1 className="text-page-title text-fg shrink-0">{t(config.titleKey)}</h1>
          )}
          {config.seoSubtitleKey && (
            <span className="text-[13px] text-fg-tertiary flex-1 min-w-0">
              {t(config.seoSubtitleKey)}
            </span>
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
            related={config.relatedTools?.map((r) => ({ title: t(r.titleKey), href: r.href }))}
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
