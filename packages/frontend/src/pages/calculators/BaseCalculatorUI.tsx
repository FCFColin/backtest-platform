import { useState, useMemo } from 'react';
import type { ElementType, ReactNode } from 'react';
import { ChevronDown, PieChart } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import { Card } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Field as FieldShell, FieldLabel } from '@/components/form/Field';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE } from '@/lib/chart-theme';
import { computeTwoFundFrontier } from './baseCalculatorUtils.js';
interface CalcFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}
export function Field({ label, value, onChange, suffix, min, max, step = 0.1 }: CalcFieldProps) {
  return (
    <FieldShell>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className={suffix ? 'pr-10' : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}
type ResultTone = 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'default';
const RESULT_TONE_CLASS: Record<ResultTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-fg-secondary',
  default: 'text-fg',
};
interface ResultRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: ResultTone;
}
export function ResultRow({ label, value, tone = 'default' }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-label text-fg-tertiary">{label}</span>
      <span
        className={cn('font-mono tabular-nums text-label font-semibold', RESULT_TONE_CLASS[tone])}
      >
        {value}
      </span>
    </div>
  );
}
export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 rounded-md bg-input-bg p-3 text-caption leading-relaxed text-fg-tertiary">
      {children}
    </div>
  );
}
interface CollapsibleCardProps {
  icon: ElementType;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}
export function CollapsibleCard({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden bg-elevated">
      <Collapsible open={open} onOpenChange={setOpen} className="w-full">
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-center gap-2.5 p-4 text-left',
            'transition-colors duration-150 hover:bg-hover',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10">
            <Icon className="size-4 text-brand" />
          </span>
          <h3 className="flex-1 text-h3 text-fg">{title}</h3>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-fg-tertiary transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 pt-0">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
export function TwoFundChart({ data }: { data: Array<{ wA: number; cagr: number; vol: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="vol"
            type="number"
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            label={{
              value: t('calculators.base.volatility'),
              position: 'insideBottom',
              offset: -4,
              fontSize: 11,
              fill: 'var(--fg-tertiary)',
            }}
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            label={{
              value: 'CAGR',
              angle: -90,
              position: 'insideLeft',
              offset: 8,
              fontSize: 11,
              fill: 'var(--fg-tertiary)',
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              `${v.toFixed(2)}%`,
              name === 'cagr' ? 'CAGR' : name,
            ]}
            labelFormatter={(l: number) =>
              t('calculators.base.volatilityWithValue', { value: `${l.toFixed(2)}%` })
            }
          />
          <Line
            type="monotone"
            dataKey="cagr"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function SWRChart({ data }: { data: Array<{ year: number; ratio: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number) => [v.toFixed(3), t('calculators.base.assetRatio')]}
          />
          <Area
            type="monotone"
            dataKey="ratio"
            stroke={CHART_COLORS[2]}
            fill={CHART_COLORS[2]}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function TwoFundPortfolioCalculator() {
  const { t } = useTranslation();
  const [cagrA, setCagrA] = useState(8);
  const [volA, setVolA] = useState(15);
  const [cagrB, setCagrB] = useState(4);
  const [volB, setVolB] = useState(5);
  const [corr, setCorr] = useState(0.2);
  const { frontier, minVarW, minVarCagr, minVarVol } = useMemo(
    () => computeTwoFundFrontier(cagrA, volA, cagrB, volB, corr),
    [cagrA, volA, cagrB, volB, corr],
  );
  return (
    <CollapsibleCard icon={PieChart} title={t('calculators.portfolio.twoFundTitle')}>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t('calculators.portfolio.assetACagr')}
          value={cagrA}
          onChange={setCagrA}
          suffix="%"
        />
        <Field
          label={t('calculators.portfolio.assetAVol')}
          value={volA}
          onChange={setVolA}
          suffix="%"
        />
        <Field
          label={t('calculators.portfolio.assetBCagr')}
          value={cagrB}
          onChange={setCagrB}
          suffix="%"
        />
        <Field
          label={t('calculators.portfolio.assetBVol')}
          value={volB}
          onChange={setVolB}
          suffix="%"
        />
      </div>
      <div className="mt-3">
        <Field
          label={t('calculators.portfolio.correlation')}
          value={corr}
          onChange={setCorr}
          step={0.05}
          min={-1}
          max={1}
        />
      </div>
      <div className="mt-1">
        <ResultRow
          label={t('calculators.portfolio.minVarWeight')}
          value={`${(minVarW * 100).toFixed(1)}%`}
          tone="brand"
        />
        <ResultRow
          label={t('calculators.portfolio.minVarCagr')}
          value={`${minVarCagr.toFixed(2)}%`}
        />
        <ResultRow
          label={t('calculators.portfolio.minVarVol')}
          value={`${minVarVol.toFixed(2)}%`}
        />
      </div>
      <TwoFundChart data={frontier} />
    </CollapsibleCard>
  );
}
