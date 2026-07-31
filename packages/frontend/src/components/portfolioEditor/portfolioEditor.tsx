import * as React from 'react';
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Portfolio, Asset, RebalanceFrequency, RebalanceBands } from '@backtest/shared';
import { Plus, ChevronDown, BookOpen, History, TrendingUp, Sparkles, X, Share2, Save, Tag, Copy, Download, Trash2, Play, BarChart3, Activity, Sigma } from 'lucide-react';
import { Play as PlayIcon, Loader2, Check } from '@/icons/icons.js';
import { Card, Button, Input, Badge, Switch, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/uiComponents';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import { INPUT_WIDTHS } from '@/lib/layout-widths.js';
import { useTickerMeta, useNsT } from '@/hooks/miscHooks.js';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore.js';
import { writeStateToURL } from '@/utils/urlState.js';
import { PRESET_PORTFOLIOS, findPresetPortfolio } from '@/store/presetPortfolios.js';
import WeightInput from '../WeightInput.js';
export type StorePortfolio = ReturnType<typeof useBacktestStore.getState>['portfolios'][number];
export type TFunc = (key: string) => string;
export type AssetPatch = { ticker?: string; weight?: number };
export type BatchUpdate = (portfolioId: string, updates: Array<{ index: number; weight: number }>) => void;
export const FIELD_STYLE = { display: 'flex', flexDirection: 'column', gap: '2px' } satisfies CSSProperties;
export const LABEL_STYLE = { fontSize: '11px', color: 'var(--text-muted)' } satisfies CSSProperties;
export const GP_FORM_STYLE = {
  padding: '12px 16px',
  marginBottom: '8px',
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-soft)'
} satisfies CSSProperties;
export const GP_TITLE_STYLE = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-strong)',
  marginBottom: '8px'
} satisfies CSSProperties;
export const GP_CONFIG_STYLE = {
  padding: '8px 10px',
  marginBottom: '6px',
  backgroundColor: 'var(--bg-elevated)',
  borderRadius: '6px',
  border: '1px solid var(--border-soft)'
} satisfies CSSProperties;
export const GP_CONFIG_TITLE_STYLE = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--accent)',
  marginBottom: '6px',
  letterSpacing: '0.02em'
} satisfies CSSProperties;
export const FIELDS_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'flex-end'
} satisfies CSSProperties;
interface AddPortfolioMenuProps {
  onAdd: (type: 'empty' | 'preset' | 'saved' | 'glidepath' | 'example') => void;
}
export function AddPortfolioMenu({ onAdd }: AddPortfolioMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t('portfolioEditor.addPortfolio')}
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAdd('empty')}>
          <Plus className="h-4 w-4 mr-2" /> {t('portfolioEditor.blankPortfolio')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('preset')}>
          <BookOpen className="h-4 w-4 mr-2" /> {t('portfolioEditor.fromPreset')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('saved')}>
          <History className="h-4 w-4 mr-2" /> {t('portfolioEditor.fromSaved')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('glidepath')}>
          <TrendingUp className="h-4 w-4 mr-2" /> {t('portfolioEditor.glidepathPortfolio')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd('example')}>
          <Sparkles className="h-4 w-4 mr-2" /> {t('portfolioEditor.loadExample')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
interface AssetWeightRowProps {
  asset: { ticker: string; weight: number };
  onUpdate: (asset: { ticker: string; weight: number }) => void;
  onDelete: () => void;
}
export function AssetWeightRow({ asset, onUpdate, onDelete }: AssetWeightRowProps) {
  const meta = useTickerMeta(asset.ticker);
  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <Input value={asset.ticker} onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })} placeholder="VTI" className={cn(INPUT_WIDTHS.ticker, 'font-mono uppercase h-9')} />
        <Input type="number" value={asset.weight} onChange={(e) => onUpdate({ ...asset, weight: Number(e.target.value) })} className={cn(INPUT_WIDTHS.weight, 'font-mono tabular-nums text-right h-9')} min={0} max={100} step={0.1} />
        <span className="text-caption text-fg-tertiary w-4">%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:text-danger" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {meta?.name && <div className="text-caption text-fg-tertiary mt-0.5 ml-1 truncate">{meta.name}</div>}
    </div>
  );
}
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={FIELD_STYLE}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}
function PortfolioSelect({ value, onChange, portfolios, t }: { value: string; onChange: (value: string) => void; portfolios: StorePortfolio[]; t: TFunc }) {
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
function GlidepathTargetWeights({ portfolio, onUpdate, t }: { portfolio: StorePortfolio; onUpdate: (id: string, patch: Partial<Portfolio>) => void; t: TFunc }) {
  return (
    <>
      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>{t('portfolio.targetWeights')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div key={ai} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '90px' }}>
              <label
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
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
                    const next = [...(portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0))];
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
export function GlidepathForm({ nonGlidepathPortfolios, onConfirm, onCancel }: { nonGlidepathPortfolios: StorePortfolio[]; onConfirm: (name: string, from: string, to: string, years: number) => void; onCancel: () => void }) {
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
          <Input type="text" value={gpName} onChange={(e) => setGpName(e.target.value)} className="h-8 w-[120px]" />
        </FieldLabel>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect value={gpFrom} onChange={setGpFrom} portfolios={nonGlidepathPortfolios} t={t} />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect value={gpTo} onChange={setGpTo} portfolios={nonGlidepathPortfolios} t={t} />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <Input type="number" value={gpYears} onChange={(e) => setGpYears(Number(e.target.value) || 1)} min={1} max={50} className="h-8 w-[60px] font-mono tabular-nums" />
        </FieldLabel>
        <Button variant="primary" size="sm" className="text-caption" disabled={!canConfirm} onClick={() => canConfirm && onConfirm(gpName, gpFrom, gpTo, gpYears)}>
          {t('common.confirm')}
        </Button>
        <Button variant="secondary" size="sm" className="text-caption" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
export function GlidepathConfig({ portfolio, nonGlidepathPortfolios, onUpdate }: { portfolio: StorePortfolio; nonGlidepathPortfolios: StorePortfolio[]; onUpdate: (id: string, patch: Partial<Portfolio>) => void }) {
  const { t } = useTranslation();
  return (
    <div style={GP_CONFIG_STYLE}>
      <div style={GP_CONFIG_TITLE_STYLE}>{t('portfolio.glidepathConfig')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect value={portfolio.glidepathFrom ?? ''} onChange={(v) => onUpdate(portfolio.id, { glidepathFrom: v })} portfolios={nonGlidepathPortfolios} t={t} />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect value={portfolio.glidepathTo ?? ''} onChange={(v) => onUpdate(portfolio.id, { glidepathTo: v })} portfolios={nonGlidepathPortfolios} t={t} />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <Input type="number" value={portfolio.glidepathYears ?? 10} onChange={(e) => onUpdate(portfolio.id, { glidepathYears: Number(e.target.value) || 1 })} min={1} max={50} className="h-8 w-[60px] font-mono tabular-nums" />
        </FieldLabel>
      </div>
      <GlidepathTargetWeights portfolio={portfolio} onUpdate={onUpdate} t={t} />
    </div>
  );
}
function handleEvenDistribute(portfolio: StorePortfolio, onBatchUpdate: BatchUpdate) {
  if (portfolio.assets.length === 0) return;
  const evenWeight = Math.floor(100 / portfolio.assets.length);
  onBatchUpdate(
    portfolio.id,
    portfolio.assets.map((_, i) => ({
      index: i,
      weight: i === 0 ? evenWeight + (100 - evenWeight * portfolio.assets.length) : evenWeight
    }))
  );
}
function handleStretchTo100(portfolio: StorePortfolio, tw: number, onBatchUpdate: BatchUpdate) {
  if (tw === 0) return;
  const rawWeights = portfolio.assets.map((a) => (a.weight / tw) * 100);
  const rounded = rawWeights.map((w) => Math.round(w * 100) / 100);
  const remainder = Math.round((100 - rounded.reduce((s, w) => s + w, 0)) * 100) / 100;
  rounded[0] = Math.round((rounded[0] + remainder) * 100) / 100;
  onBatchUpdate(
    portfolio.id,
    portfolio.assets.map((_, i) => ({ index: i, weight: rounded[i] }))
  );
}
function TickerAssetRow({ asset, assetIdx, portfolioId, onRemoveAsset, onUpdateAsset, t }: { asset: StorePortfolio['assets'][number]; assetIdx: number; portfolioId: string; onRemoveAsset: (id: string, ticker: string) => void; onUpdateAsset: (portfolioId: string, assetIdx: number, patch: AssetPatch) => void; t: TFunc }) {
  return <WeightInput key={asset.id ?? assetIdx} value={asset.weight} onChange={(num) => onUpdateAsset(portfolioId, assetIdx, { weight: num })} ticker={asset.ticker} tickerPlaceholder={t('portfolio.tickerPlaceholder')} onTickerChange={(newTicker) => onUpdateAsset(portfolioId, assetIdx, { ticker: newTicker })} onDelete={() => onRemoveAsset(portfolioId, asset.ticker)} />;
}
export function PortfolioToolbarAndAssets({ portfolio, tw, onAddAsset, onRemoveAsset, onUpdateAsset, onBatchUpdate }: { portfolio: StorePortfolio; tw: number; onAddAsset: (id: string) => void; onRemoveAsset: (id: string, ticker: string) => void; onUpdateAsset: (portfolioId: string, assetIdx: number, patch: AssetPatch) => void; onBatchUpdate: BatchUpdate }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="secondary" size="sm" onClick={() => onAddAsset(portfolio.id)}>
          <Plus />
          {t('portfolio.addAsset')}
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="text-fg-tertiary hover:bg-hover hover:text-fg" onClick={() => handleEvenDistribute(portfolio, onBatchUpdate)}>
          {t('portfolio.evenDistribute')}
        </Button>
        <Button variant="ghost" size="sm" className="text-fg-tertiary hover:bg-hover hover:text-fg" onClick={() => handleStretchTo100(portfolio, tw, onBatchUpdate)}>
          {t('portfolio.stretchTo100')}
        </Button>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {portfolio.assets.map((asset, assetIdx) => (
          <TickerAssetRow key={asset.id ?? assetIdx} asset={asset} assetIdx={assetIdx} portfolioId={portfolio.id} onRemoveAsset={onRemoveAsset} onUpdateAsset={onUpdateAsset} t={t} />
        ))}
      </div>
    </>
  );
}
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
function RebalanceControls({ portfolio, rebalanceOptions, onUpdate, t }: { portfolio: StorePortfolio; rebalanceOptions: { value: RebalanceFrequency; label: string }[]; onUpdate: (id: string, patch: Partial<Portfolio>) => void; t: TFunc }) {
  return (
    <>
      <Select value={portfolio.rebalanceFrequency} onValueChange={(v) => onUpdate(portfolio.id, { rebalanceFrequency: v as RebalanceFrequency })}>
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
      <div className="flex items-center gap-1 shrink-0">
        <Input type="number" value={portfolio.rebalanceOffset ?? 0} min={0} max={252} className={numCls} title={t('portfolio.offsetTitle')} onChange={(e) => onUpdate(portfolio.id, { rebalanceOffset: Number(e.target.value) || 0 })} />
        <span className="text-caption text-fg-tertiary shrink-0">{t('portfolio.offset')}</span>
      </div>
      {portfolio.rebalanceFrequency === 'threshold' && (
        <div className="flex items-center gap-1 shrink-0">
          <Input type="number" value={portfolio.rebalanceThreshold ?? 5} min={1} max={50} className={numCls} onChange={(e) => onUpdate(portfolio.id, { rebalanceThreshold: Number(e.target.value) })} />
          <span className="text-caption text-fg-tertiary shrink-0">%</span>
        </div>
      )}
    </>
  );
}
function RebalanceBandsRow({ portfolio, onUpdate }: { portfolio: StorePortfolio; onUpdate: (id: string, patch: Partial<Portfolio>) => void }) {
  const { t } = useTranslation();
  if (!portfolio.rebalanceBands?.enabled) return null;
  const bands = portfolio.rebalanceBands;
  const items: {
    labelKey: string;
    titleKey: string;
    value: number | undefined;
    min: number;
    max: number;
    step: number;
    field: 'absoluteBand' | 'relativeBand';
  }[] = [
    { labelKey: 'portfolio.absoluteDeviation', titleKey: 'portfolio.absoluteDeviationTitle', value: bands.absoluteBand, min: 0.1, max: 50, step: 0.5, field: 'absoluteBand' },
    { labelKey: 'portfolio.relativeDeviation', titleKey: 'portfolio.relativeDeviationTitle', value: bands.relativeBand, min: 1, max: 100, step: 1, field: 'relativeBand' }
  ];
  return (
    <div className="flex flex-wrap items-end gap-3 mt-1">
      {items.map((item) => (
        <div key={item.field} className="flex flex-col gap-0.5">
          <label className="text-caption text-fg-tertiary">{t(item.labelKey)}</label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={item.value ?? (item.field === 'absoluteBand' ? 5 : 20)}
              min={item.min}
              max={item.max}
              step={item.step}
              className={numCls80}
              title={t(item.titleKey)}
              onChange={(e) =>
                onUpdate(portfolio.id, {
                  rebalanceBands: {
                    enabled: true,
                    absoluteBand: item.field === 'absoluteBand' ? Number(e.target.value) || undefined : bands.absoluteBand,
                    relativeBand: item.field === 'relativeBand' ? Number(e.target.value) || undefined : bands.relativeBand
                  } as RebalanceBands
                })
              }
            />
            <span className="text-caption text-fg-tertiary shrink-0">%</span>
          </div>
        </div>
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
  { type: 'fr', icon: Sigma, labelKey: 'portfolio.factorRegression' }
];
// eslint-disable-next-line max-lines-per-function
export function PortfolioCardV2({ portfolio, color, rebalanceOptions, nonGlidepathPortfolios, onUpdate, onDelete, onDuplicate, onSave, onDeepAnalysis }: PortfolioCardV2Props) {
  const { t } = useTranslation();
  const tw = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
  const isComplete = Math.abs(tw - 100) <= 0.01;
  const isGp = portfolio.isGlidepath;
  const handleEqualize = () => {
    const n = portfolio.assets.length;
    if (n === 0) return;
    const each = 100 / n;
    onUpdate(portfolio.id, {
      assets: portfolio.assets.map((a) => ({ ...a, weight: Math.round(each * 10) / 10 }))
    });
  };
  const handleNormalize = () => {
    if (tw === 0) return;
    onUpdate(portfolio.id, {
      assets: portfolio.assets.map((a) => ({ ...a, weight: Math.round((a.weight / tw) * 1000) / 10 }))
    });
  };
  const actionBtns = [
    { icon: Copy, title: t('portfolio.copyPortfolio'), onClick: onDuplicate, variant: 'icon' as const },
    { icon: Download, title: t('portfolio.saveAsJson'), onClick: () => onSave(portfolio), variant: 'icon' as const },
    { icon: Trash2, title: t('common.delete'), onClick: onDelete, variant: 'destructive' as const }
  ];
  return (
    <Card data-testid="portfolio-card" className={cn('relative group p-3 pt-8', isGp && 'border-l-[3px] border-l-accent bg-input-bg/30')} style={{ borderTop: `3px solid ${color}` }}>
      {/* Actions — hover 时显示 */}
      <div className="absolute top-2 right-2 flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 z-20">
        {actionBtns.map((b, i) => (
          <Button key={i} variant={b.variant} size="icon" title={b.title} onClick={b.onClick}>
            <b.icon />
          </Button>
        ))}
      </div>
      {/* Header — Glidepath 配置（仅 glidepath 组合） */}
      {isGp && (
        <div className="mb-2">
          <GlidepathConfig portfolio={portfolio} nonGlidepathPortfolios={nonGlidepathPortfolios} onUpdate={onUpdate} />
        </div>
      )}
      {/* Meta — 名称 + 标签 + 预设 + 分享 + 保存（P3-6） */}
      <PortfolioMetaEditor portfolio={portfolio} onUpdate={onUpdate} />
      {/* Header — 调仓频率 + 偏移 + 拖累 + 总回报 + 偏差带 */}
      <div data-testid="portfolio-header" className="flex items-center gap-1.5 mb-2 flex-wrap">
        <RebalanceControls portfolio={portfolio} rebalanceOptions={rebalanceOptions} onUpdate={onUpdate} t={t} />
        <div className="flex flex-col gap-0.5 shrink-0">
          <label className="text-caption text-fg-tertiary">{t('portfolio.drag')}</label>
          <div className="flex items-center gap-1">
            <Input type="number" value={portfolio.drag ?? 0} min={0} max={10} step={0.1} className={numCls} title={t('portfolio.dragTitle')} onChange={(e) => onUpdate(portfolio.id, { drag: Number(e.target.value) || 0 })} />
            <span className="text-caption text-fg-tertiary shrink-0">%</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch checked={portfolio.totalReturn ?? true} onCheckedChange={(v) => onUpdate(portfolio.id, { totalReturn: v })} />
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
                  relativeBand: portfolio.rebalanceBands?.relativeBand
                } as RebalanceBands
              })
            }
          />
          <span className="text-caption text-fg-secondary">{t('portfolio.deviationBands')}</span>
        </div>
      </div>
      {/* 偏差带参数行 */}
      <RebalanceBandsRow portfolio={portfolio} onUpdate={onUpdate} />
      {/* 资产列表 */}
      <div data-testid="portfolio-assets" className="flex flex-col gap-1.5">
        {portfolio.assets.map((asset, i) => (
          <AssetWeightRow
            key={i}
            asset={asset}
            onUpdate={(newAsset) =>
              onUpdate(portfolio.id, {
                assets: portfolio.assets.map((a, idx) => (idx === i ? newAsset : a))
              })
            }
            onDelete={() =>
              onUpdate(portfolio.id, {
                assets: portfolio.assets.filter((_, idx) => idx !== i)
              })
            }
          />
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-fg-tertiary hover:text-fg -ml-2"
            onClick={() =>
              onUpdate(portfolio.id, {
                assets: [...portfolio.assets, { ticker: '', weight: 0 }]
              })
            }
          >
            + {t('portfolio.addAsset')}
          </Button>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="text-caption" onClick={handleEqualize}>
              {t('common.equalize')}
            </Button>
            <Button variant="ghost" size="sm" className="text-caption" onClick={handleNormalize}>
              {t('common.normalize')}
            </Button>
          </div>
        </div>
      </div>
      {/* Footer — 合计 + 深度分析 */}
      <div data-testid="portfolio-footer" className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle">
        <div className="flex items-center gap-2 text-caption">
          <span className="text-fg-tertiary uppercase tracking-wide">{t('portfolio.total')}</span>
          <span className={cn('font-mono tabular-nums font-semibold', isComplete ? 'text-success' : 'text-warning')}>{tw.toFixed(1)}%</span>
          <span className={cn('w-1.5 h-1.5 rounded-full', isComplete ? 'bg-success' : 'bg-warning')} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-caption h-7" data-testid="deep-analysis-menu">
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
function toAssetsWithIds(presetAssets: { ticker: string; weight: number }[]): Asset[] {
  const now = Date.now();
  return presetAssets.map((a, idx) => ({
    id: `asset-${now}-${idx}`,
    ticker: a.ticker,
    weight: a.weight
  }));
}
function sharePortfolioState(t: TFunc): void {
  const state = useBacktestStore.getState().getShareableState();
  const url = writeStateToURL(state);
  navigator.clipboard
    .writeText(url)
    .then(() => useToastStore.getState().addToast('success', t('backtest.shareLinkCopied')))
    .catch(() => useToastStore.getState().addToast('success', t('backtest.shareLinkManual')));
}
function confirmMetaSaved(t: TFunc): void {
  useToastStore.getState().addToast('success', t('portfolio.metaSaved'));
}
function TagsRow({ tags, onAddTag, onRemoveTag, t }: { tags: string[]; onAddTag: (tag: string) => void; onRemoveTag: (tag: string) => void; t: TFunc }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAddTag(trimmed);
    }
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="w-3 h-3 text-fg-tertiary shrink-0" />
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" size="sm" className="gap-0.5">
          {tag}
          <button type="button" className="ml-0.5 hover:text-destructive transition-colors" aria-label={t('portfolio.removeTag')} onClick={() => onRemoveTag(tag)}>
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
          <DropdownMenuItem key={preset.id} onClick={() => onLoadPreset(preset.id)} className="flex flex-col items-start gap-0.5">
            <span className="text-caption font-medium">{t(preset.nameKey)}</span>
            <span className="text-caption text-fg-tertiary">{t(preset.descriptionKey)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function PortfolioMetaEditor({ portfolio, onUpdate }: PortfolioMetaEditorProps) {
  const { t } = useTranslation();
  const tags = useMemo(() => portfolio.tags ?? [], [portfolio.tags]);
  const handleAddTag = useCallback(
    (tag: string) => {
      if (tags.includes(tag)) return;
      onUpdate(portfolio.id, { tags: [...tags, tag] });
    },
    [portfolio.id, tags, onUpdate]
  );
  const handleRemoveTag = useCallback((tag: string) => onUpdate(portfolio.id, { tags: tags.filter((x) => x !== tag) }), [portfolio.id, tags, onUpdate]);
  const handleLoadPreset = useCallback(
    (presetId: string) => {
      const preset = findPresetPortfolio(presetId);
      if (!preset) return;
      onUpdate(portfolio.id, {
        name: t(preset.nameKey),
        assets: toAssetsWithIds(preset.assets),
        tags: [...preset.tags]
      });
      useToastStore.getState().addToast('success', t('portfolio.presetLoaded'));
    },
    [portfolio.id, onUpdate, t]
  );
  return (
    <div className="flex flex-col gap-1.5 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Input type="text" value={portfolio.name} onChange={(e) => onUpdate(portfolio.id, { name: e.target.value })} placeholder={t('portfolio.name')} className="h-8 w-[160px] text-body" aria-label={t('portfolio.name')} />
        <PresetMenu onLoadPreset={handleLoadPreset} t={t} />
        <Button variant="ghost" size="sm" className="h-7 text-caption" onClick={() => sharePortfolioState(t)} title={t('portfolio.shareTitle')}>
          <Share2 className="w-3.5 h-3.5" />
          {t('portfolio.share')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-caption" onClick={() => confirmMetaSaved(t)} title={t('portfolio.saveTitle')}>
          <Save className="w-3.5 h-3.5" />
          {t('portfolio.save')}
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
export function RunBacktestButton({ onRun, isRunning, runComplete, elapsedMs }: RunBacktestButtonProps) {
  const { t } = useNsT('backtest');
  const [showComplete, setShowComplete] = useState(false);
  useEffect(() => {
    if (runComplete) {
      setShowComplete(true);
      const timer = setTimeout(() => setShowComplete(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [runComplete]);
  if (isRunning) {
    return (
      <Button variant="primary" size="default" disabled className="min-w-[160px]">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        {t('backtest.running')}
      </Button>
    );
  }
  if (showComplete) {
    return (
      <Button variant="primary" size="default" className={cn('min-w-[160px] bg-success hover:bg-success text-white', 'animate-in fade-in-0 zoom-in-95 duration-200')} disabled>
        <Check className="h-4 w-4 mr-2" />
        {elapsedMs ? t('backtest.completeWithTime', { seconds: (elapsedMs / 1000).toFixed(1) }) : t('backtest.complete')}
      </Button>
    );
  }
  return (
    <Button variant="primary" size="default" onClick={onRun} className="min-w-[160px]">
      <PlayIcon className="h-4 w-4 mr-2" />
      {t('backtest.run')}
    </Button>
  );
}
export function AllocationBar({ assets, tw }: { assets: { ticker: string; weight: number; id?: string }[]; tw: number }) {
  const scale = tw > 100 ? 100 / tw : 1;
  return (
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input-bg" role="img" aria-label="allocation">
      <div className="flex h-full">
        {assets.map((a, i) =>
          a.weight > 0 ? (
            <div
              key={a.id ?? i}
              className="h-full shrink-0"
              style={{
                width: `${a.weight * scale}%`,
                backgroundColor: getPortfolioColor(i)
              }}
              title={`${a.ticker || '?'} ${a.weight}%`}
            />
          ) : null
        )}
      </div>
    </div>
  );
}
export function TotalWeightBlock({ tw, isComplete }: { tw: number; isComplete: boolean }) {
  return <div className={cn('flex h-8 w-[96px] shrink-0 items-center justify-end rounded-md border px-2.5 font-mono text-caption tabular-nums', isComplete ? 'border-success/40 bg-success/5 text-success' : 'border-danger/40 bg-danger/5 text-danger')}>{Number.isInteger(tw) ? tw : tw.toFixed(2)}%</div>;
}
