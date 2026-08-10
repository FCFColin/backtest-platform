import { useId, useState } from 'react';
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
import { ParamCard } from '@/components/params/paramsLayout.js';
import type { StorePortfolio } from './portfolioEditor.js';

const numCls = 'h-8 w-[70px] font-mono tabular-nums';
const FIELDS_ROW = 'flex flex-wrap gap-2 items-end';

function PortfolioSelect({
  value,
  onChange,
  portfolios,
}: {
  value: string;
  onChange: (v: string) => void;
  portfolios: StorePortfolio[];
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {portfolios.map((p, i) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name || `${t('Portfolio')} ${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GlidepathTargetWeights({
  portfolio,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{t('Target Weights')}</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div key={ai} className="flex flex-col gap-0.5 min-w-[90px]">
              <label className="text-[10px] text-[var(--text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">
                {asset.ticker || `${t('Asset')} ${ai + 1}`}
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
                    const next = [
                      ...(portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0)),
                    ];
                    next[ai] = e.target.value === '' ? 0 : Number(e.target.value) / 100;
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
      <ParamCard label={t('Source Portfolio')}>
        <PortfolioSelect value={from} onChange={onFromChange} portfolios={portfolios} />
      </ParamCard>
      <ParamCard label={t('Target Portfolio')}>
        <PortfolioSelect value={to} onChange={onToChange} portfolios={portfolios} />
      </ParamCard>
      <ParamCard label={t('Transition Years')}>
        <Input
          type="number"
          value={years}
          onChange={(e) => onYearsChange(Number(e.target.value) || 1)}
          min={1}
          max={50}
          className="h-8 w-[60px] font-mono tabular-nums"
        />
      </ParamCard>
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
  const [gp, setGp] = useState({ name: '', from: '', to: '', years: 10 });
  const canConfirm = gp.from && gp.to && gp.from !== gp.to;
  return (
    <div className="p-3 mb-2 bg-elevated rounded-[var(--radius-control)] border border-border-subtle">
      <div className="text-[13px] font-semibold text-[var(--text-strong)] mb-2">
        {t('New Glide Path')}
      </div>
      <div className={FIELDS_ROW}>
        <ParamCard label={t('Name')}>
          <Input
            type="text"
            value={gp.name}
            onChange={(e) => setGp((p) => ({ ...p, name: e.target.value }))}
            className="h-8 w-[120px]"
          />
        </ParamCard>
        <GlidepathFields
          from={gp.from}
          to={gp.to}
          years={gp.years}
          onFromChange={(v) => setGp((p) => ({ ...p, from: v }))}
          onToChange={(v) => setGp((p) => ({ ...p, to: v }))}
          onYearsChange={(v) => setGp((p) => ({ ...p, years: v }))}
          portfolios={nonGlidepathPortfolios}
        />
        <Button
          variant="primary"
          size="sm"
          className="text-caption"
          disabled={!canConfirm}
          onClick={() => canConfirm && onConfirm(gp.name, gp.from, gp.to, gp.years)}
        >
          {t('Confirm')}
        </Button>
        <Button variant="secondary" size="sm" className="text-caption" onClick={onCancel}>
          {t('Cancel')}
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
    <div className="p-2 mb-1.5 bg-elevated rounded-md border border-border-subtle">
      <div className="text-[11px] font-semibold text-brand mb-1.5 tracking-tight">
        {t('Glide Path Configuration')}
      </div>
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
      <GlidepathTargetWeights portfolio={portfolio} onUpdate={onUpdate} />
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
  const { t } = useTranslation();
  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <Input
          value={asset.ticker}
          onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })}
          placeholder="VTI"
          className={cn('w-[220px]', 'font-mono uppercase h-9')}
        />
        <Input
          type="number"
          value={asset.weight}
          onChange={(e) => onUpdate({ ...asset, weight: Number(e.target.value) })}
          className={cn('w-[100px]', 'font-mono tabular-nums text-right h-9')}
          min={0}
          max={100}
          step={0.1}
        />
        <span className="text-caption text-fg-tertiary w-4">%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('Delete')}
          className="h-7 w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:text-danger"
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
  const inputId = useId();
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      {label && (
        <label htmlFor={inputId} className="text-caption text-fg-tertiary">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        <Input
          id={inputId}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          className={width}
          title={title}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(e.target.value === '' || Number.isNaN(v) ? min : v);
          }}
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
}: {
  portfolio: StorePortfolio;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();
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
        title={t('Trading days offset from period end')}
        suffix={t('Offset')}
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
      label: t('portfolio.absoluteDeviation'),
      title: t('portfolio.absoluteDeviation'),
      val: bands.absoluteBand,
      min: 0.1,
      max: 50,
      step: 0.5,
      field: 'absoluteBand' as const,
    },
    {
      label: t('portfolio.relativeDeviation'),
      title: t('portfolio.relativeDeviation'),
      val: bands.relativeBand,
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
          label={item.label}
          value={item.val ?? 5}
          min={item.min}
          max={item.max}
          step={item.step}
          title={item.title}
          width="h-8 w-[80px] font-mono tabular-nums"
          onChange={(v) =>
            onUpdate(portfolio.id, {
              rebalanceBands: {
                ...bands,
                enabled: true,
                [item.field]: v || undefined,
              } as RebalanceBands,
            })
          }
        />
      ))}
    </div>
  );
}
