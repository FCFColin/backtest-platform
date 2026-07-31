import * as React from 'react';
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Portfolio, Asset, RebalanceFrequency, RebalanceBands } from '@backtest/shared';
import {
  BookOpen,
  ChevronDown,
  X,
  Share2,
  Save,
  Tag,
  Copy,
  Download,
  Trash2,
  Play,
  BarChart3,
  Activity,
  Sigma,
} from 'lucide-react';
import { Play as PlayIcon, Loader2, Check } from '@/icons/icons.js';
import {
  Card,
  Button,
  Input,
  Badge,
  Switch,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import { INPUT_WIDTHS } from '@/lib/layout-widths.js';
import { useTickerMeta, useNsT } from '@/hooks/miscHooks.js';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore.js';
import { writeStateToURL } from '@/utils/urlState.js';
import { PRESET_PORTFOLIOS, findPresetPortfolio } from '@/store/presetPortfolios.js';

export type StorePortfolio = ReturnType<typeof useBacktestStore.getState>['portfolios'][number];
export type TFunc = (key: string) => string;
const FIELD_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
} satisfies CSSProperties;
const LABEL_STYLE = { fontSize: '11px', color: 'var(--text-muted)' } satisfies CSSProperties;
const GP_FORM_STYLE = {
  padding: '12px 16px',
  marginBottom: '8px',
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-soft)',
} satisfies CSSProperties;
const GP_TITLE_STYLE = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-strong)',
  marginBottom: '8px',
} satisfies CSSProperties;
const GP_CONFIG_STYLE = {
  padding: '8px 10px',
  marginBottom: '6px',
  backgroundColor: 'var(--bg-elevated)',
  borderRadius: '6px',
  border: '1px solid var(--border-soft)',
} satisfies CSSProperties;
const GP_CONFIG_TITLE_STYLE = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--accent)',
  marginBottom: '6px',
  letterSpacing: '0.02em',
} satisfies CSSProperties;
const FIELDS_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'flex-end',
} satisfies CSSProperties;

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={FIELD_STYLE}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}
function PortfolioSelect({
  value,
  onChange,
  portfolios,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  portfolios: StorePortfolio[];
  t: TFunc;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {portfolios.map((p, idx) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name || `${t('portfolio.portfolio')} ${idx + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function GlidepathTargetWeights({
  portfolio,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  const boxStyle = (minWidth: number): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: `${minWidth}px`,
  });
  return (
    <>
      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
        {t('portfolio.targetWeights')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div key={ai} style={boxStyle(90)}>
              <label
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {asset.ticker || `${t('portfolio.asset')} ${ai + 1}`}
              </label>
              <div className="flex items-center gap-1" style={{ height: '28px' }}>
                <Input
                  type="number"
                  value={w != null ? +(w * 100).toFixed(2) : ''}
                  min={0}
                  max={100}
                  step={1}
                  className="h-7 w-[70px] font-mono tabular-nums"
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : Number(e.target.value) / 100;
                    const next = [
                      ...(portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0)),
                    ];
                    next[ai] = v;
                    onUpdate(portfolio.id, { glidepathToWeights: next });
                  }}
                />
                <span className="text-caption text-fg-tertiary shrink-0">%</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
export function GlidepathForm({
  nonGlidepathPortfolios,
  onConfirm,
  onCancel,
}: {
  nonGlidepathPortfolios: StorePortfolio[];
  onConfirm: (name: string, from: string, to: string, years: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [gpName, setGpName] = useState('');
  const [gpFrom, setGpFrom] = useState('');
  const [gpTo, setGpTo] = useState('');
  const [gpYears, setGpYears] = useState(10);
  const canConfirm = gpFrom && gpTo && gpFrom !== gpTo;
  return (
    <div style={GP_FORM_STYLE}>
      <div style={GP_TITLE_STYLE}>{t('portfolio.newGlidepath')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.name')}>
          <Input
            type="text"
            value={gpName}
            onChange={(e) => setGpName(e.target.value)}
            className="h-8 w-[120px]"
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect
            value={gpFrom}
            onChange={setGpFrom}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect
            value={gpTo}
            onChange={setGpTo}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <Input
            type="number"
            value={gpYears}
            onChange={(e) => setGpYears(Number(e.target.value) || 1)}
            min={1}
            max={50}
            className="h-8 w-[60px] font-mono tabular-nums"
          />
        </FieldLabel>
        <Button
          variant="primary"
          size="sm"
          className="text-caption"
          disabled={!canConfirm}
          onClick={() => canConfirm && onConfirm(gpName, gpFrom, gpTo, gpYears)}
        >
          {t('common.confirm')}
        </Button>
        <Button variant="secondary" size="sm" className="text-caption" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
function GlidepathConfig({
  portfolio,
  nonGlidepathPortfolios,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  nonGlidepathPortfolios: StorePortfolio[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={GP_CONFIG_STYLE}>
      <div style={GP_CONFIG_TITLE_STYLE}>{t('portfolio.glidepathConfig')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect
            value={portfolio.glidepathFrom ?? ''}
            onChange={(v) => onUpdate(portfolio.id, { glidepathFrom: v })}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect
            value={portfolio.glidepathTo ?? ''}
            onChange={(v) => onUpdate(portfolio.id, { glidepathTo: v })}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <Input
            type="number"
            value={portfolio.glidepathYears ?? 10}
            onChange={(e) =>
              onUpdate(portfolio.id, { glidepathYears: Number(e.target.value) || 1 })
            }
            min={1}
            max={50}
            className="h-8 w-[60px] font-mono tabular-nums"
          />
        </FieldLabel>
      </div>
      <GlidepathTargetWeights portfolio={portfolio} onUpdate={onUpdate} t={t} />
    </div>
  );
}
function AssetWeightRow({
  asset,
  onUpdate,
  onDelete,
}: {
  asset: { ticker: string; weight: number };
  onUpdate: (asset: { ticker: string; weight: number }) => void;
  onDelete: () => void;
}) {
  const meta = useTickerMeta(asset.ticker);
  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <Input
          value={asset.ticker}
          onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })}
          placeholder="VTI"
          className={cn(INPUT_WIDTHS.ticker, 'font-mono uppercase h-9')}
        />
        <Input
          type="number"
          value={asset.weight}
          onChange={(e) => onUpdate({ ...asset, weight: Number(e.target.value) })}
          className={cn(INPUT_WIDTHS.weight, 'font-mono tabular-nums text-right h-9')}
          min={0}
          max={100}
          step={0.1}
        />
        <span className="text-caption text-fg-tertiary w-4">%</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:text-danger"
          onClick={onDelete}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {meta?.name && (
        <div className="text-caption text-fg-tertiary mt-0.5 ml-1 truncate">{meta.name}</div>
      )}
    </div>
  );
}
function NumField({
  label,
  value,
  min,
  max,
  step = 1,
  title,
  suffix = '%',
  onChange,
  width = numCls,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  title?: string;
  suffix?: string;
  onChange: (v: number) => void;
  width?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      {label && <label className="text-caption text-fg-tertiary">{label}</label>}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          className={width}
          title={title}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-caption text-fg-tertiary shrink-0">{suffix}</span>
      </div>
    </div>
  );
}
function RebalanceControls({
  portfolio,
  rebalanceOptions,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <>
      <Select
        value={portfolio.rebalanceFrequency}
        onValueChange={(v) =>
          onUpdate(portfolio.id, { rebalanceFrequency: v as RebalanceFrequency })
        }
      >
        <SelectTrigger className="h-8 w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {rebalanceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <NumField
        value={portfolio.rebalanceOffset ?? 0}
        min={0}
        max={252}
        title={t('portfolio.offsetTitle')}
        suffix={t('portfolio.offset')}
        onChange={(v) => onUpdate(portfolio.id, { rebalanceOffset: v || 0 })}
      />
      {portfolio.rebalanceFrequency === 'threshold' && (
        <NumField
          value={portfolio.rebalanceThreshold ?? 5}
          min={1}
          max={50}
          onChange={(v) => onUpdate(portfolio.id, { rebalanceThreshold: v })}
        />
      )}
    </>
  );
}
function RebalanceBandsRow({
  portfolio,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();
  const bands = portfolio.rebalanceBands;
  if (!bands?.enabled) return null;
  const items = [
    {
      labelKey: 'portfolio.absoluteDeviation',
      titleKey: 'portfolio.absoluteDeviationTitle',
      value: bands.absoluteBand,
      min: 0.1,
      max: 50,
      step: 0.5,
      field: 'absoluteBand' as const,
    },
    {
      labelKey: 'portfolio.relativeDeviation',
      titleKey: 'portfolio.relativeDeviationTitle',
      value: bands.relativeBand,
      min: 1,
      max: 100,
      step: 1,
      field: 'relativeBand' as const,
    },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3 mt-1">
      {items.map((item) => (
        <NumField
          key={item.field}
          label={t(item.labelKey)}
          value={item.value ?? (item.field === 'absoluteBand' ? 5 : 20)}
          min={item.min}
          max={item.max}
          step={item.step}
          title={t(item.titleKey)}
          width={numCls80}
          onChange={(v) =>
            onUpdate(portfolio.id, {
              rebalanceBands: {
                enabled: true,
                absoluteBand: item.field === 'absoluteBand' ? v || undefined : bands.absoluteBand,
                relativeBand: item.field === 'relativeBand' ? v || undefined : bands.relativeBand,
              } as RebalanceBands,
            })
          }
        />
      ))}
    </div>
  );
}
const DEEP_ANALYSIS_ITEMS: {
  type: 'backtest' | 'mc' | 'ef' | 'fr';
  icon: typeof Play;
  labelKey: string;
}[] = [
  { type: 'backtest', icon: Play, labelKey: 'portfolio.singleBacktest' },
  { type: 'mc', icon: Activity, labelKey: 'portfolio.monteCarlo' },
  { type: 'ef', icon: BarChart3, labelKey: 'portfolio.efficientFrontier' },
  { type: 'fr', icon: Sigma, labelKey: 'portfolio.factorRegression' },
];
interface PortfolioCardV2Props {
  portfolio: StorePortfolio;
  index: number;
  color: string;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  nonGlidepathPortfolios: StorePortfolio[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSave: (p: StorePortfolio) => void;
  onDeepAnalysis: (type: 'backtest' | 'mc' | 'ef' | 'fr') => void;
}
const numCls = 'h-8 w-[70px] font-mono tabular-nums';
const numCls80 = 'h-8 w-[80px] font-mono tabular-nums';
// eslint-disable-next-line max-lines-per-function -- 组合卡片渲染分支多，拆分反而损失内聚
export function PortfolioCardV2({
  portfolio,
  color,
  rebalanceOptions,
  nonGlidepathPortfolios,
  onUpdate,
  onDelete,
  onDuplicate,
  onSave,
  onDeepAnalysis,
}: PortfolioCardV2Props) {
  const { t } = useTranslation();
  const tw = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
  const isComplete = Math.abs(tw - 100) <= 0.01;
  const isGp = portfolio.isGlidepath;
  const setAssets = (assets: Asset[]) => onUpdate(portfolio.id, { assets });
  const equalize = () => {
    const n = portfolio.assets.length;
    if (n === 0) return;
    setAssets(portfolio.assets.map((a) => ({ ...a, weight: Math.round((100 / n) * 10) / 10 })));
  };
  const normalize = () => {
    if (tw === 0) return;
    setAssets(
      portfolio.assets.map((a) => ({ ...a, weight: Math.round((a.weight / tw) * 1000) / 10 })),
    );
  };
  const actionBtns = [
    {
      icon: Copy,
      title: t('portfolio.copyPortfolio'),
      onClick: onDuplicate,
      variant: 'icon' as const,
    },
    {
      icon: Download,
      title: t('portfolio.saveAsJson'),
      onClick: () => onSave(portfolio),
      variant: 'icon' as const,
    },
    { icon: Trash2, title: t('common.delete'), onClick: onDelete, variant: 'destructive' as const },
  ];
  return (
    <Card
      data-testid="portfolio-card"
      className={cn(
        'relative group p-3 pt-8',
        isGp && 'border-l-[3px] border-l-accent bg-input-bg/30',
      )}
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="absolute top-2 right-2 flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 z-20">
        {actionBtns.map((b, i) => (
          <Button key={i} variant={b.variant} size="icon" title={b.title} onClick={b.onClick}>
            <b.icon />
          </Button>
        ))}
      </div>
      {isGp && (
        <GlidepathConfig
          portfolio={portfolio}
          nonGlidepathPortfolios={nonGlidepathPortfolios}
          onUpdate={onUpdate}
        />
      )}
      <PortfolioMetaEditor portfolio={portfolio} onUpdate={onUpdate} />
      <div data-testid="portfolio-header" className="flex items-center gap-1.5 mb-2 flex-wrap">
        <RebalanceControls
          portfolio={portfolio}
          rebalanceOptions={rebalanceOptions}
          onUpdate={onUpdate}
          t={t}
        />
        <NumField
          label={t('portfolio.drag')}
          value={portfolio.drag ?? 0}
          min={0}
          max={10}
          step={0.1}
          title={t('portfolio.dragTitle')}
          onChange={(v) => onUpdate(portfolio.id, { drag: v || 0 })}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={portfolio.totalReturn ?? true}
            onCheckedChange={(v) => onUpdate(portfolio.id, { totalReturn: v })}
          />
          <span className="text-caption text-fg-secondary">{t('portfolio.totalReturn')}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={portfolio.rebalanceBands?.enabled ?? false}
            onCheckedChange={(v) =>
              onUpdate(portfolio.id, {
                rebalanceBands: {
                  enabled: v,
                  absoluteBand: portfolio.rebalanceBands?.absoluteBand,
                  relativeBand: portfolio.rebalanceBands?.relativeBand,
                } as RebalanceBands,
              })
            }
          />
          <span className="text-caption text-fg-secondary">{t('portfolio.deviationBands')}</span>
        </div>
      </div>
      <RebalanceBandsRow portfolio={portfolio} onUpdate={onUpdate} />
      <div data-testid="portfolio-assets" className="flex flex-col gap-1.5">
        {portfolio.assets.map((asset, i) => (
          <AssetWeightRow
            key={i}
            asset={asset}
            onUpdate={(newAsset) =>
              setAssets(portfolio.assets.map((a, idx) => (idx === i ? newAsset : a)))
            }
            onDelete={() => setAssets(portfolio.assets.filter((_, idx) => idx !== i))}
          />
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-fg-tertiary hover:text-fg -ml-2"
            onClick={() => setAssets([...portfolio.assets, { ticker: '', weight: 0 }])}
          >
            + {t('portfolio.addAsset')}
          </Button>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="text-caption" onClick={equalize}>
              {t('common.equalize')}
            </Button>
            <Button variant="ghost" size="sm" className="text-caption" onClick={normalize}>
              {t('common.normalize')}
            </Button>
          </div>
        </div>
      </div>
      <div
        data-testid="portfolio-footer"
        className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle"
      >
        <div className="flex items-center gap-2 text-caption">
          <span className="text-fg-tertiary uppercase tracking-wide">{t('portfolio.total')}</span>
          <span
            className={cn(
              'font-mono tabular-nums font-semibold',
              isComplete ? 'text-success' : 'text-warning',
            )}
          >
            {tw.toFixed(1)}%
          </span>
          <span
            className={cn('w-1.5 h-1.5 rounded-full', isComplete ? 'bg-success' : 'bg-warning')}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-caption h-7"
              data-testid="deep-analysis-menu"
            >
              {t('portfolio.deepAnalysis')} <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {DEEP_ANALYSIS_ITEMS.map((item) => (
              <DropdownMenuItem key={item.type} onClick={() => onDeepAnalysis(item.type)}>
                <item.icon className="h-4 w-4 mr-2" /> {t(item.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
interface PortfolioMetaEditorProps {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}
const toAssetsWithIds = (presetAssets: { ticker: string; weight: number }[]): Asset[] => {
  const now = Date.now();
  return presetAssets.map((a, idx) => ({
    id: `asset-${now}-${idx}`,
    ticker: a.ticker,
    weight: a.weight,
  }));
};
const sharePortfolioState = (t: TFunc): void => {
  const url = writeStateToURL(useBacktestStore.getState().getShareableState());
  navigator.clipboard
    .writeText(url)
    .then(() => useToastStore.getState().addToast('success', t('backtest.shareLinkCopied')))
    .catch(() => useToastStore.getState().addToast('success', t('backtest.shareLinkManual')));
};
const confirmMetaSaved = (t: TFunc): void =>
  useToastStore.getState().addToast('success', t('portfolio.metaSaved'));
function TagsRow({
  tags,
  onAddTag,
  onRemoveTag,
  t,
}: {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  t: TFunc;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !tags.includes(trimmed)) onAddTag(trimmed);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="w-3 h-3 text-fg-tertiary shrink-0" />
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" size="sm" className="gap-0.5">
          {tag}
          <button
            type="button"
            className="ml-0.5 hover:text-destructive transition-colors"
            aria-label={t('portfolio.removeTag')}
            onClick={() => onRemoveTag(tag)}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </Badge>
      ))}
      <Input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={t('portfolio.addTag')}
        className="h-7 w-[120px] text-caption"
      />
    </div>
  );
}
function PresetMenu({ onLoadPreset, t }: { onLoadPreset: (presetId: string) => void; t: TFunc }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-caption">
          <BookOpen className="w-3.5 h-3.5" />
          {t('portfolio.loadPreset')}
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PRESET_PORTFOLIOS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onClick={() => onLoadPreset(preset.id)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="text-caption font-medium">{t(preset.nameKey)}</span>
            <span className="text-caption text-fg-tertiary">{t(preset.descriptionKey)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function PortfolioMetaEditor({ portfolio, onUpdate }: PortfolioMetaEditorProps) {
  const { t } = useTranslation();
  const tags = useMemo(() => portfolio.tags ?? [], [portfolio.tags]);
  const handleAddTag = useCallback(
    (tag: string) => {
      if (!tags.includes(tag)) onUpdate(portfolio.id, { tags: [...tags, tag] });
    },
    [portfolio.id, tags, onUpdate],
  );
  const handleRemoveTag = useCallback(
    (tag: string) => onUpdate(portfolio.id, { tags: tags.filter((x) => x !== tag) }),
    [portfolio.id, tags, onUpdate],
  );
  const handleLoadPreset = useCallback(
    (presetId: string) => {
      const preset = findPresetPortfolio(presetId);
      if (!preset) return;
      onUpdate(portfolio.id, {
        name: t(preset.nameKey),
        assets: toAssetsWithIds(preset.assets),
        tags: [...preset.tags],
      });
      useToastStore.getState().addToast('success', t('portfolio.presetLoaded'));
    },
    [portfolio.id, onUpdate, t],
  );
  return (
    <div className="flex flex-col gap-1.5 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Input
          type="text"
          value={portfolio.name}
          onChange={(e) => onUpdate(portfolio.id, { name: e.target.value })}
          placeholder={t('portfolio.name')}
          className="h-8 w-[160px] text-body"
          aria-label={t('portfolio.name')}
        />
        <PresetMenu onLoadPreset={handleLoadPreset} t={t} />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-caption"
          onClick={() => sharePortfolioState(t)}
          title={t('portfolio.shareTitle')}
        >
          <Share2 className="w-3.5 h-3.5" /> {t('portfolio.share')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-caption"
          onClick={() => confirmMetaSaved(t)}
          title={t('portfolio.saveTitle')}
        >
          <Save className="w-3.5 h-3.5" /> {t('portfolio.save')}
        </Button>
      </div>
      <TagsRow tags={tags} onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} t={t} />
    </div>
  );
}
interface RunBacktestButtonProps {
  onRun: () => void;
  isRunning: boolean;
  runComplete: boolean;
  elapsedMs?: number;
}
export function RunBacktestButton({
  onRun,
  isRunning,
  runComplete,
  elapsedMs,
}: RunBacktestButtonProps) {
  const { t } = useNsT('backtest');
  const [showComplete, setShowComplete] = useState(false);
  useEffect(() => {
    if (!runComplete) return;
    setShowComplete(true);
    const timer = setTimeout(() => setShowComplete(false), 3000);
    return () => clearTimeout(timer);
  }, [runComplete]);
  if (isRunning)
    return (
      <Button variant="primary" size="default" disabled className="min-w-[160px]">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        {t('backtest.running')}
      </Button>
    );
  if (showComplete)
    return (
      <Button
        variant="primary"
        size="default"
        className={cn(
          'min-w-[160px] bg-success hover:bg-success text-white',
          'animate-in fade-in-0 zoom-in-95 duration-200',
        )}
        disabled
      >
        <Check className="h-4 w-4 mr-2" />
        {elapsedMs
          ? t('backtest.completeWithTime', { seconds: (elapsedMs / 1000).toFixed(1) })
          : t('backtest.complete')}
      </Button>
    );
  return (
    <Button variant="primary" size="default" onClick={onRun} className="min-w-[160px]">
      <PlayIcon className="h-4 w-4 mr-2" />
      {t('backtest.run')}
    </Button>
  );
}
export function AllocationBar({
  assets,
  tw,
}: {
  assets: { ticker: string; weight: number; id?: string }[];
  tw: number;
}) {
  const scale = tw > 100 ? 100 / tw : 1;
  return (
    <div
      className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input-bg"
      role="img"
      aria-label="allocation"
    >
      <div className="flex h-full">
        {assets.map((a, i) =>
          a.weight > 0 ? (
            <div
              key={a.id ?? i}
              className="h-full shrink-0"
              style={{ width: `${a.weight * scale}%`, backgroundColor: getPortfolioColor(i) }}
              title={`${a.ticker || '?'} ${a.weight}%`}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
export function TotalWeightBlock({ tw, isComplete }: { tw: number; isComplete: boolean }) {
  return (
    <div
      className={cn(
        'flex h-8 w-[96px] shrink-0 items-center justify-end rounded-md border px-2.5 font-mono text-caption tabular-nums',
        isComplete
          ? 'border-success/40 bg-success/5 text-success'
          : 'border-danger/40 bg-danger/5 text-danger',
      )}
    >
      {Number.isInteger(tw) ? tw : tw.toFixed(2)}%
    </div>
  );
}
