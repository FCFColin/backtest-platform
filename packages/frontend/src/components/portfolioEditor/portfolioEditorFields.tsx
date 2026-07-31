import * as React from 'react';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Portfolio, RebalanceFrequency, RebalanceBands } from '@backtest/shared';
import { X } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { useTickerMeta } from '@/hooks/miscHooks.js';
import { cn } from '@/lib/utils';
import { INPUT_WIDTHS } from '@/lib/layout-widths.js';
import type { StorePortfolio, TFunc } from './portfolioEditor.js';

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
const numCls = 'h-8 w-[70px] font-mono tabular-nums';
const numCls80 = 'h-8 w-[80px] font-mono tabular-nums';

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
export function GlidepathConfig({
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
export function AssetWeightRow({
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
export function NumField({
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
export function RebalanceControls({
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
export function RebalanceBandsRow({
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
