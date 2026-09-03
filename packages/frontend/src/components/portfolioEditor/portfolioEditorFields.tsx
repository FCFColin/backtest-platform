import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as UI from '@/components/ui/uiComponents';
import type { Asset, Portfolio, RebalanceBands, RebalanceFrequency } from '@backtest/shared';
import { X } from 'lucide-react';
import { ParamCard } from '@/components/params/paramsLayout.js';
import { useBacktestStore } from '@/store/backtestStore';
import { useTickerMeta } from '@/hooks/miscHooks.js';
import { cn } from '@/lib/utils';
import { getPortfolioColor } from '@/lib/chart-theme.js';
export type StorePortfolio = ReturnType<typeof useBacktestStore.getState>['portfolios'][number];
export type TFunc = (key: string) => string;
export interface PortfolioFieldProps {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}
type SelectCoreProps = { value: string; onChange: (v: string) => void };
type GpVals = Pick<Portfolio, 'glidepathFrom' | 'glidepathTo' | 'glidepathYears'>;
type GpProps = { g: GpVals; portfolios: StorePortfolio[]; set: (q: Partial<GpVals>) => void };
function PortfolioSelect(p: SelectCoreProps & { portfolios: StorePortfolio[]; label: string }) {
  return (
    <ParamCard label={p.label}>
      <UI.Select value={p.value} onValueChange={p.onChange}>
        <UI.SelectTrigger className="h-8 w-[120px]">
          <UI.SelectValue />
        </UI.SelectTrigger>
        <UI.SelectContent>
          {p.portfolios.map((pf, i) => (
            <UI.SelectItem key={pf.id} value={pf.id}>
              {pf.name || `${p.label} ${i + 1}`}
            </UI.SelectItem>
          ))}
        </UI.SelectContent>
      </UI.Select>
    </ParamCard>
  );
}
function GlidepathFields(p: GpProps) {
  const { t } = useTranslation(),
    { g, set, portfolios } = p,
    sel = (lb: string, v: string, f: (x: string) => Partial<GpVals>) => (
      <PortfolioSelect
        value={v}
        portfolios={portfolios}
        label={t(lb)}
        onChange={(x) => set(f(x))}
      />
    );
  return (
    <>
      {sel('Source Portfolio', g.glidepathFrom ?? '', (x) => ({ glidepathFrom: x }))}
      {sel('Target Portfolio', g.glidepathTo ?? '', (x) => ({ glidepathTo: x }))}
      <ParamCard label={t('Transition Years')}>
        <UI.Input
          type="number"
          min={1}
          max={50}
          value={g.glidepathYears ?? 10}
          className="h-8 w-[60px] font-mono tabular-nums"
          onChange={(e) => set({ glidepathYears: Number(e.target.value) || 1 })}
        />
      </ParamCard>
    </>
  );
}
export function GlidepathForm(p: {
  nonGlidepathPortfolios: StorePortfolio[];
  onConfirm: (name: string, from: string, to: string, years: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(),
    [gp, setGp] = useState({ glidepathFrom: '', glidepathTo: '', glidepathYears: 10 }),
    [name, setName] = useState(''),
    { onConfirm, onCancel, nonGlidepathPortfolios: avail } = p,
    { glidepathFrom: from, glidepathTo: to, glidepathYears: yrs } = gp,
    ok = from && to && from !== to,
    btn = (vr: 'primary' | 'secondary', on: () => void, lb: string, dis?: boolean) => (
      <UI.Button variant={vr} size="sm" className="text-caption" disabled={dis} onClick={on}>
        {t(lb)}
      </UI.Button>
    );
  return (
    <div className="p-3 mb-2 bg-elevated rounded-lg border border-border-subtle">
      <div className="text-label font-semibold text-fg mb-2">{t('New Glide Path')}</div>
      <div className="flex flex-wrap gap-2 items-end">
        <ParamCard label={t('Name')}>
          <UI.Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-[120px]"
          />
        </ParamCard>
        <GlidepathFields g={gp} portfolios={avail} set={(q) => setGp((s) => ({ ...s, ...q }))} />
        {btn('primary', () => ok && onConfirm(name, from, to, yrs), 'Confirm', !ok)}
        {btn('secondary', onCancel, 'Cancel')}
      </div>
    </div>
  );
}
export function GlidepathConfig(
  p: PortfolioFieldProps & { nonGlidepathPortfolios: StorePortfolio[] },
) {
  const { t } = useTranslation(),
    { portfolio, onUpdate, nonGlidepathPortfolios: avail } = p,
    base = portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0);
  return (
    <div className="p-2 mb-1.5 bg-elevated rounded-md border border-border-subtle">
      <div className="text-label-tiny font-semibold text-brand mb-1.5 tracking-tight">
        {t('Glide Path Configuration')}
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <GlidepathFields g={portfolio} portfolios={avail} set={(q) => onUpdate(portfolio.id, q)} />
      </div>
      <div className="mt-1.5 text-label-tiny text-fg-tertiary">Target Weights</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div key={ai} className="flex flex-col gap-0.5 min-w-[90px]">
              <label className="text-micro text-fg-tertiary truncate">
                {asset.ticker || `Asset ${ai + 1}`}
              </label>
              <div className="flex items-center gap-1 h-7">
                <UI.Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="h-7 w-[70px] font-mono tabular-nums"
                  value={w != null ? +(w * 100).toFixed(2) : ''}
                  onChange={(e) => {
                    const next = [...base];
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
    </div>
  );
}
export function AssetWeightRow(p: {
  asset: Asset;
  onUpdate: (a: Asset) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(),
    meta = useTickerMeta(p.asset.ticker);
  return (
    <div className="group">
      <div className="flex flex-wrap items-center gap-2">
        <UI.Input
          value={p.asset.ticker}
          placeholder="VTI"
          className="w-full min-w-[180px] flex-1 sm:w-[160px] sm:flex-none font-mono uppercase h-9"
          onChange={(e) => p.onUpdate({ ...p.asset, ticker: e.target.value.toUpperCase() })}
        />
        <UI.Input
          type="number"
          value={p.asset.weight}
          min={0}
          max={100}
          step={0.1}
          className="w-[80px] font-mono tabular-nums text-right h-9"
          aria-label={`${p.asset.ticker} ${t('Weight %')}`}
          onChange={(e) => p.onUpdate({ ...p.asset, weight: Number(e.target.value) })}
        />
        <span className="text-caption text-fg-tertiary w-3">%</span>
        <UI.Input
          type="number"
          value={p.asset.fee ?? ''}
          min={0}
          max={5}
          step={0.01}
          placeholder="0.00"
          className="w-[70px] font-mono tabular-nums text-right h-9"
          aria-label={`${p.asset.ticker} fee`}
          onChange={(e) =>
            p.onUpdate({
              ...p.asset,
              fee: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
        <span className="text-caption text-fg-tertiary w-6">fee%</span>
        <UI.Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity hover:text-danger"
          onClick={p.onDelete}
          aria-label={t('Remove {{ticker}}', { ticker: p.asset.ticker })}
        >
          <X className="h-3.5 w-3.5" />
        </UI.Button>
      </div>
      {meta?.name && (
        <div className="text-caption text-fg-tertiary mt-0.5 ml-1 truncate">{meta.name}</div>
      )}
    </div>
  );
}
export function NumField(p: {
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
      {p.label && <label className="text-caption text-fg-tertiary">{p.label}</label>}
      <UI.AffixInput
        type="number"
        value={p.value}
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        suffix={p.suffix ?? '%'}
        title={p.title}
        className={p.width ?? 'h-8 w-[70px] font-mono tabular-nums'}
        onChange={(e) => {
          const v = Number(e.target.value);
          p.onChange(e.target.value === '' || Number.isNaN(v) ? p.min : v);
        }}
      />
    </div>
  );
}
export function RebalanceControls(
  p: PortfolioFieldProps & { rebalanceOptions: { value: RebalanceFrequency; label: string }[] },
) {
  const { t } = useTranslation();
  return (
    <>
      <UI.Select
        value={p.portfolio.rebalanceFrequency}
        onValueChange={(v) =>
          p.onUpdate(p.portfolio.id, { rebalanceFrequency: v as RebalanceFrequency })
        }
      >
        <UI.SelectTrigger className="h-8 w-[110px] shrink-0">
          <UI.SelectValue />
        </UI.SelectTrigger>
        <UI.SelectContent>
          {p.rebalanceOptions.map((o) => (
            <UI.SelectItem key={o.value} value={o.value}>
              {o.label}
            </UI.SelectItem>
          ))}
        </UI.SelectContent>
      </UI.Select>
      <NumField
        value={p.portfolio.rebalanceOffset ?? 0}
        min={0}
        max={252}
        title={t('Trading days offset from period end')}
        suffix={t('Offset')}
        onChange={(v) => p.onUpdate(p.portfolio.id, { rebalanceOffset: v || 0 })}
      />
      {p.portfolio.rebalanceFrequency === 'threshold' && (
        <NumField
          value={p.portfolio.rebalanceThreshold ?? 5}
          min={1}
          max={50}
          onChange={(v) => p.onUpdate(p.portfolio.id, { rebalanceThreshold: v })}
        />
      )}
    </>
  );
}
const BANDS = [
  ['absoluteBand', 'portfolio.absoluteDeviation', 0.1, 50, 0.5],
  ['relativeBand', 'portfolio.relativeDeviation', 1, 100, 1],
] as const;
export function RebalanceBandsRow({ portfolio, onUpdate }: PortfolioFieldProps) {
  const { t } = useTranslation(),
    bands = portfolio.rebalanceBands;
  if (!bands?.enabled) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 mt-1">
      {BANDS.map(([f, lb, min, max, step]) => (
        <NumField
          key={f}
          label={t(lb)}
          title={t(lb)}
          value={bands[f] ?? 5}
          min={min}
          max={max}
          step={step}
          width="h-8 w-[80px] font-mono tabular-nums"
          onChange={(v) =>
            onUpdate(portfolio.id, {
              rebalanceBands: { ...bands, enabled: true, [f]: v || undefined } as RebalanceBands,
            })
          }
        />
      ))}
    </div>
  );
}
export function AllocationBar({ assets, tw }: { assets: Asset[]; tw: number }) {
  const scale = tw > 100 ? 100 / tw : 1;
  return (
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input-bg">
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
