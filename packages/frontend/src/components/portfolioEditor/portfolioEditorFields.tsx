import * as React from 'react';
import { useState } from 'react';
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
import { INPUT_WIDTHS } from '@/utils/constants';
import type { StorePortfolio, TFunc } from './portfolioEditor.js';

const numCls = 'h-8 w-[70px] font-mono tabular-nums';
const numCls80 = 'h-8 w-[80px] font-mono tabular-nums';
const GP_FORM = 'p-3 mb-2 bg-bg-subtle rounded-[var(--radius-control)] border border-border-soft';
const GP_TITLE = 'text-[13px] font-semibold text-text-strong mb-2';
const GP_CONFIG = 'p-2 mb-1.5 bg-bg-elevated rounded-md border border-border-soft';
const GP_CONFIG_TITLE = 'text-[11px] font-semibold text-accent mb-1.5 tracking-tight';
const FIELDS_ROW = 'flex flex-wrap gap-2 items-end';

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[11px] text-text-muted">{label}</label>
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
  onChange: (v: string) => void;
  portfolios: StorePortfolio[];
  t: TFunc;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {portfolios.map((p, i) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name || `${t('portfolio.portfolio')} ${i + 1}`}
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
  return (
    <>
      <div className="mt-1.5 text-[11px] text-text-muted">{t('portfolio.targetWeights')}</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div key={ai} className="flex flex-col gap-0.5 min-w-[90px]">
              <label className="text-[10px] text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">
                {asset.ticker || `${t('portfolio.asset')} ${ai + 1}`}
              </label>
              <div className="flex items-center gap-1 h-7">
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

function GlidepathFields({
  from,
  to,
  years,
  onFromChange,
  onToChange,
  onYearsChange,
  portfolios,
}: {
  from: string;
  to: string;
  years: number;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onYearsChange: (v: number) => void;
  portfolios: StorePortfolio[];
}) {
  const { t } = useTranslation();
  return (
    <>
      <FieldLabel label={t('portfolio.sourcePortfolio')}>
        <PortfolioSelect value={from} onChange={onFromChange} portfolios={portfolios} t={t} />
      </FieldLabel>
      <FieldLabel label={t('portfolio.targetPortfolio')}>
        <PortfolioSelect value={to} onChange={onToChange} portfolios={portfolios} t={t} />
      </FieldLabel>
      <FieldLabel label={t('portfolio.transitionYears')}>
        <Input
          type="number"
          value={years}
          onChange={(e) => onYearsChange(Number(e.target.value) || 1)}
          min={1}
          max={50}
          className="h-8 w-[60px] font-mono tabular-nums"
        />
      </FieldLabel>
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
    <div className={GP_FORM}>
      <div className={GP_TITLE}>{t('portfolio.newGlidepath')}</div>
      <div className={FIELDS_ROW}>
        <FieldLabel label={t('portfolio.name')}>
          <Input
            type="text"
            value={gpName}
            onChange={(e) => setGpName(e.target.value)}
            className="h-8 w-[120px]"
          />
        </FieldLabel>
        <GlidepathFields
          from={gpFrom}
          to={gpTo}
          years={gpYears}
          onFromChange={setGpFrom}
          onToChange={setGpTo}
          onYearsChange={setGpYears}
          portfolios={nonGlidepathPortfolios}
        />
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
    <div className={GP_CONFIG}>
      <div className={GP_CONFIG_TITLE}>{t('portfolio.glidepathConfig')}</div>
      <div className={FIELDS_ROW}>
        <GlidepathFields
          from={portfolio.glidepathFrom ?? ''}
          to={portfolio.glidepathTo ?? ''}
          years={portfolio.glidepathYears ?? 10}
          onFromChange={(v) => onUpdate(portfolio.id, { glidepathFrom: v })}
          onToChange={(v) => onUpdate(portfolio.id, { glidepathTo: v })}
          onYearsChange={(v) => onUpdate(portfolio.id, { glidepathYears: v })}
          portfolios={nonGlidepathPortfolios}
        />
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
  onUpdate: (a: { ticker: string; weight: number }) => void;
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
          {rebalanceOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
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
