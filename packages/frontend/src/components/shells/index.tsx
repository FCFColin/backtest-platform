/**
 * @file 页面外壳组件聚合
 * @description StandardPageShell / ComputeToolShell + 共享类型统一导出。
 *   合并自 StandardPageShell / ComputeToolShell / types。
 */
import type { ReactElement, ReactNode, ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolSeoCard, ToolPageLayout } from '../layout/ToolPageLayout.js';

// ============ 共享类型 ============

export interface PresetButtonProps {
  label: string;
  onClick: () => void;
}

export interface SeoFeature {
  titleKey: string;
  descKey: string;
}

export interface RelatedTool {
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
}

export interface StandardPageConfig {
  titleKey: string;
  breadcrumbs?: { label: string; href?: string }[];
  headerExtra?: ReactNode;
}

// ============ StandardPageShell ============

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
        <h1 className="bt-page-title">{t(config.titleKey)}</h1>
        {config.headerExtra}
      </div>
      {children}
    </div>
  );
}

// ============ ComputeToolShell ============

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
    <div className="card" style={{ marginBottom: 12 }}>
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
  const AfterParams = config.afterParams;
  const Extra = config.extra;
  const presetButtons = config.presets?.(state);

  const paramsTitle = config.hideParamsTitle
    ? undefined
    : (config.paramsTitle ?? t(config.paramsTitleKey ?? 'params.basicParams'));

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t(config.titleKey)}</h1>
        <div className="bt-page-actions">
          <button className="btn-upgrade">{t('common.upgrade')}</button>
          <button className="btn-pill-outline">{t('common.about')}</button>
          <button className="btn-pill-outline">{t('common.limits')}</button>
        </div>
      </div>

      {config.seoDescKey && (
        <ToolSeoCard
          subtitle={config.seoSubtitleKey ? t(config.seoSubtitleKey) : undefined}
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
        title={paramsTitle}
        params={<Params state={state} />}
        afterParams={AfterParams ? <AfterParams state={state} /> : undefined}
        results={Results ? <Results state={state} /> : undefined}
      />

      {Extra && <Extra state={state} />}
    </div>
  );
}
