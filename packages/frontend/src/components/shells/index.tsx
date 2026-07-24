/**
 * @file 页面外壳组件聚合
 * @description StandardPageShell / ComputeToolShell + 共享类型统一导出。
 *   合并自 StandardPageShell / ComputeToolShell / types。
 */
import type { ReactElement, ReactNode, ComponentType } from 'react';
import { useState } from 'react';
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

/** 页面头部操作按钮区（关于 / 相关工具） */
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
    <div className="page-header-actions">
      {showAbout && (
        <button className="text-link-subtle" onClick={onToggle}>
          {t('common.about')}
        </button>
      )}
      {showRelated && (
        <button className="text-link-subtle" onClick={onToggle}>
          {t('backtest.relatedTools')}
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
      <span className="preset-label">{t('monteCarlo.presets')}：</span>
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
          <h1 className="page-title-slim">{t(config.titleKey)}</h1>
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
