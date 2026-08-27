import { useState, useId, type ElementType, type ReactNode } from 'react';
import {
  ChevronDown,
  PieChart,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  BarChart3,
  Layers,
  Target,
  Flame,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import {
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  AffixInput,
} from '@/components/ui/uiComponents';
import { Field as FieldShell, FieldLabel } from '@/components/form/Field';
import { cn } from '@/lib/utils';
import { SimpleLineChart, SimpleAreaChart } from '@/components/charts/sharedChartContent.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { fmtPct, fmtCompact } from '@/utils/format';

type State = Record<string, number>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type DPt = { year: number; value: number };
type ResultTone = 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'default';
const TONE_CLASS: Record<ResultTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-fg-secondary',
  default: 'text-fg',
};
type Row = { label: string; value: string; tone?: ResultTone };
const R = (label: string, value: string, tone?: ResultTone): Row => ({ label, value, tone });
const INFO_CLS = 'mt-2.5 rounded-md bg-input-bg p-3 text-caption leading-relaxed text-fg-tertiary';
const NORM_CDF_COEFFS = [1.061405429, -1.453152027, 1.421413741, -0.284496736, 0.254829592];

function normCdf(x: number) {
  const y = x / Math.SQRT2,
    a = Math.abs(y),
    t = 1 / (1 + 0.3275911 * a),
    p = NORM_CDF_COEFFS.reduce((acc, c) => acc * t + c) * t;
  return 0.5 * (1 + (y < 0 ? -1 : 1) * (1 - p * Math.exp(-a * a)));
}
type FieldBase = { suffix?: string; step?: number; min?: number; max?: number };
type FieldDef = FieldBase & { key: string; label: string; default: number };
type FieldProps = FieldBase & { label: string; value: number; onChange: (v: number) => void };

function Field({ label, value, onChange, suffix, min, max, step = 0.1 }: FieldProps) {
  const id = useId();
  return (
    <FieldShell>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <AffixInput
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
      />
    </FieldShell>
  );
}
function ResultRow({ label, value, tone = 'default' }: Row) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-label text-fg-tertiary">{label}</span>
      <span className={cn('font-mono tabular-nums text-label font-semibold', TONE_CLASS[tone])}>
        {value}
      </span>
    </div>
  );
}
interface CalcConfig {
  icon: ElementType;
  title: string;
  defaultOpen?: boolean;
  cols?: 2 | 3;
  fields: FieldDef[];
  info?: string;
  extra?: (state: State, setState: React.Dispatch<React.SetStateAction<State>>) => ReactNode;
  compute: (state: State, t: TFn) => { rows?: Row[]; rowsClassName?: string; chart?: ReactNode };
}
function createCalculator(config: CalcConfig) {
  return function Calculator() {
    const { t } = useTranslation();
    const { fields, cols = 2, icon: Icon, title, info, extra, compute } = config;
    const [open, setOpen] = useState(config.defaultOpen ?? false);
    const [state, setState] = useState<State>(() =>
      Object.fromEntries(fields.map((f) => [f.key, f.default])),
    );
    const { rows = [], rowsClassName = 'mt-3', chart } = compute(state, t);
    const extraNode = extra?.(state, setState);
    return (
      <Card className="overflow-hidden bg-elevated">
        <Collapsible open={open} onOpenChange={setOpen} className="w-full">
          <CollapsibleTrigger className="flex w-full items-center gap-2.5 p-4 text-left transition-colors duration-150 hover:bg-hover">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10">
              <Icon className="size-4 text-brand" />
            </span>
            <h3 className="flex-1 text-h3 text-fg">{t(title)}</h3>
            <ChevronDown
              className={`size-4 shrink-0 text-fg-tertiary transition-transform duration-200${open ? ' rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 pt-0">
              <div className={cols === 3 ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}>
                {fields.map((f) => (
                  <Field
                    {...f}
                    key={f.label}
                    label={t(f.label)}
                    value={state[f.key]}
                    suffix={f.suffix ? t(f.suffix) : undefined}
                    onChange={(v) => setState((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}
              </div>
              {extraNode && <div className="mt-3">{extraNode}</div>}
              <div className={rowsClassName}>
                {rows.map((r) => (
                  <ResultRow key={r.label} {...r} />
                ))}
              </div>
              {chart}
              {info && <div className={INFO_CLS}>{t(info)}</div>}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };
}
function MiniChart({ type = 'area', showLegend = false, ...props }: MiniChartProps) {
  const C = type === 'line' ? SimpleLineChart : SimpleAreaChart;
  return (
    <div className="mt-3">
      <C showLegend={showLegend} {...props} />
    </div>
  );
}
type MiniChartProps = { type?: 'area' | 'line' } & Parameters<typeof SimpleAreaChart>[0];
const yearArea = (t: TFn, data: DPt[], height: number): ReactNode => (
  <MiniChart
    data={data}
    height={height}
    yTickFormatter={fmtCompact}
    tooltipFormatter={(v: number) => [fmtCompact(v), t('Final Value')]}
    series={[{ dataKey: 'value', color: getPortfolioColor(0), width: 2, areaOpacity: 0.12 }]}
  />
);
const correlationExtra: CalcConfig['extra'] = (s, set) => (
  <Field
    label="Correlation"
    value={s.corr ?? 0.2}
    onChange={(v) => set((p) => ({ ...p, corr: v }))}
    step={0.05}
    min={-1}
    max={1}
  />
);
const CAGR = createCalculator({ icon: TrendingUp, title: 'CAGR Calculator', defaultOpen: true, cols: 3, fields: [{ key: 'initial', label: 'Initial Value', default: 10000, step: 1000, min: 0 }, { key: 'finalVal', label: 'Final Value', default: 50000, step: 1000, min: 0 }, { key: 'years', label: 'Years', default: 10, suffix: 'y', step: 1, min: 1 }], info: 'Formula: CAGR = (Final Value / Initial Value)^(1 / Years) - 1', compute: (s) => ({ rows: [R('CAGR', fmtPct(s.initial > 0 && s.years > 0 ? Math.pow(s.finalVal / s.initial, 1 / s.years) - 1 : 0), 'brand')] }) });
const FutureValue = createCalculator({
  icon: DollarSign,
  title: 'Future Value Calculation',
  defaultOpen: true,
  fields: [{ key: 'initial', label: 'Initial Value', default: 10000, step: 1000, min: 0 }, { key: 'cagr', label: 'CAGR', default: 8, suffix: '%', step: 0.5 }, { key: 'years', label: 'Years', default: 20, suffix: 'y', step: 1, min: 1 }, { key: 'monthly', label: 'Monthly Contribution', default: 500, step: 100, min: 0 }],
  compute: (s, t) => {
    const r = s.cagr / 100,
      mr = r / 12,
      ms = s.years * 12,
      curve: DPt[] = [];
    let acc = s.initial;
    for (let m = 0; m <= ms; m++) {
      if (m % 12 === 0) curve.push({ year: m / 12, value: acc });
      if (m < ms) acc = acc * (1 + mr) + s.monthly;
    }
    const fv = acc,
      tc = s.initial + s.monthly * ms;
    return {
      rows: [
        R('Final Value', fmtCompact(fv), 'brand'),
        R('Total Contribution', fmtCompact(tc)),
        R('Investment Gain', fmtCompact(fv - tc), 'success'),
      ],
      chart: yearArea(t, curve, 240),
    };
  },
});
const CAGRAssumption = createCalculator({
  icon: TrendingUp,
  title: 'Assumptions',
  fields: [
    { key: 'cagr', label: 'Expected Return', default: 8, suffix: '%' },
    { key: 'years', label: 'Time', default: 20, suffix: 'y', step: 1 },
    { key: 'initial', label: 'Initial Capital', default: 10000, step: 1000 },
  ],
  compute: (s, t) => {
    const curve = Array.from({ length: s.years + 1 }, (_, i) => ({
      year: i,
      value: s.initial * Math.pow(1 + s.cagr / 100, i),
    }));
    const fv = curve[s.years].value;
    return { rows: [R('Final Value', fmtCompact(fv), 'brand')], chart: yearArea(t, curve, 200) };
  },
});
const SWR = createCalculator({
  icon: ShieldAlert,
  title: 'Safe Withdrawal Rate (SWR) Calculator',
  fields: [
    { key: 'expectedReturn', label: 'Expected Return', default: 7, suffix: '%', step: 0.5 },
    { key: 'volatility', label: 'Volatility', default: 15, suffix: '%', step: 1 },
    { key: 'rY', label: 'Retirement Years', default: 30, suffix: 'y', step: 1, min: 1 },
    { key: 'sT', label: 'Success Target', default: 95, suffix: '%', step: 1, min: 50, max: 99 },
  ],
  info: 'Formula: SWR ≈ (Expected Return - Risk Premium × Volatility²) / (1 + Risk Premium × Volatility²)',
  compute: (s, t) => {
    const mu = s.expectedReturn / 100,
      sigma = s.volatility / 100,
      z = 1.645 + (s.sT / 100 - 0.95) * 10 * 0.842,
      swr = Math.min(Math.max(mu - 0.5 * sigma ** 2 - (z * sigma) / Math.sqrt(s.rY), 0), 0.1);
    let r = 1;
    const pts = Array.from({ length: s.rY }, (_, i) => {
      r *= (1 + mu) * (1 - swr);
      return { year: i + 1, ratio: r };
    });
    return {
      rows: [
        R(t('Estimated SWR'), fmtPct(swr), 'brand'),
        R(t('Annual Withdrawal (per $1M)'), String(Math.round(swr * 1_000_000)), 'success'),
      ],
      chart: (
        <MiniChart
          data={pts}
          height={160}
          xDataKey="year"
          yTickFormatter={(v) => v.toFixed(1)}
          tooltipFormatter={(v) => [v.toFixed(3), t('Asset Ratio')]}
          series={[{ dataKey: 'ratio', color: getPortfolioColor(2), width: 2, areaOpacity: 0.12 }]}
        />
      ),
    };
  },
});
const AssetAllocationRisk = createCalculator({
  icon: BarChart3,
  title: 'Risk Contribution Calculator',
  fields: [
    { key: 'sPct', label: 'Stock Percentage', default: 60, suffix: '%', step: 5, min: 0, max: 100 },
    { key: 'bPct', label: 'Bond Percentage', default: 40, suffix: '%', step: 5, min: 0, max: 100 },
    { key: 'stockVol', label: 'Stock Volatility', default: 18, suffix: '%', step: 1 },
    { key: 'bondVol', label: 'Bond Volatility', default: 5, suffix: '%', step: 1 },
  ],
  info: 'Formula: σp = √(ws²σs² + wb²σb² + 2wswbσsσbρ)',
  extra: correlationExtra,
  compute: (s) => {
    const ws = s.sPct / 100,
      wb = s.bPct / 100,
      vs = s.stockVol / 100,
      vb = s.bondVol / 100,
      rho = s.corr ?? 0.2,
      pv = Math.sqrt(ws ** 2 * vs ** 2 + wb ** 2 * vb ** 2 + 2 * ws * wb * rho * vs * vb),
      pv2 = pv * pv,
      sw = ws * vs + wb * vb - pv,
      ss = ws ** 2 * vs ** 2 + ws * wb * rho * vs * vb,
      sb = wb ** 2 * vb ** 2 + ws * wb * rho * vs * vb;
    return {
      rowsClassName: 'mt-2',
      rows: [
        R('Portfolio Volatility', fmtPct(pv), 'brand'),
        R('Diversification Benefit', fmtPct(sw), 'success'),
        R('Stock Risk Contribution', fmtPct(ss / pv2)),
        R('Bond Risk Contribution', fmtPct(sb / pv2)),
      ],
    };
  },
});
const LeverageDecay = createCalculator({
  icon: Layers,
  title: 'Volatility Decay Calculator',
  cols: 3,
  fields: [
    { key: 'baseVol', label: 'Asset Volatility', default: 18, suffix: '%', step: 1 },
    { key: 'leverage', label: 'Leverage Multiplier', default: 3, suffix: 'x', step: 0.5, min: 1 },
    { key: 'years', label: 'Holding Years', default: 10, suffix: 'y', step: 1, min: 1 },
  ],
  info: 'Decay Formula: Total Decay = (1 - (1 - Annual Drag)^Years) × 100%',
  compute: (s, t) => {
    const sigma = s.baseVol / 100,
      l = s.leverage,
      drag = ((l ** 2 - l) * sigma ** 2) / 2,
      td = 1 - Math.pow(1 - drag, s.years);
    return {
      rows: [
        R(t('Annual Volatility Drag'), fmtPct(drag), 'warning'),
        R(t('{{years}}-Year Total Decay', { years: s.years }), fmtPct(td), 'danger'),
        R(t('Effective Loss'), fmtPct(-td), 'danger'),
      ],
    };
  },
});
const LeverageETF = createCalculator({
  icon: Layers,
  title: 'Leveraged ETF Calculator',
  fields: [
    { key: 'baseCagr', label: 'Base CAGR', default: 8, suffix: '%' },
    { key: 'baseVol', label: 'Base Volatility', default: 15, suffix: '%' },
    { key: 'leverage', label: 'Leverage Multiplier', default: 2, suffix: 'x', step: 0.5, min: 1 },
    { key: 'borrowSpread', label: 'Borrow Spread', default: 1, suffix: '%' },
  ],
  compute: (s) => {
    const mu = s.baseCagr / 100,
      sigma = s.baseVol / 100,
      l = s.leverage,
      rb = s.borrowSpread / 100,
      lc = l * mu - (l - 1) * rb - ((l ** 2 - l) * sigma ** 2) / 2,
      lv = l * sigma;
    return {
      rows: [
        R('Leveraged CAGR', fmtPct(lc), 'brand'),
        R('Leveraged Volatility', fmtPct(lv), 'warning'),
        R('Leveraged Sharpe', (lc / lv).toFixed(3)),
      ],
    };
  },
});
const KellyLeverage = createCalculator({
  icon: Target,
  title: 'Kelly Formula Calculator',
  cols: 3,
  fields: [
    { key: 'baseCagr', label: 'Base CAGR', default: 8, suffix: '%' },
    { key: 'baseVol', label: 'Volatility', default: 15, suffix: '%' },
    { key: 'riskFree', label: 'Risk-Free Rate', default: 4, suffix: '%' },
  ],
  info: 'Kelly Formula: f* = (μ - r) / σ²',
  compute: (s) => {
    const mu = s.baseCagr / 100,
      sigma = s.baseVol / 100,
      rf = s.riskFree / 100,
      k = (mu - rf) / sigma ** 2,
      hk = k / 2,
      oc = rf + k * (mu - rf) - (k ** 2 * sigma ** 2) / 2,
      hc = rf + hk * (mu - rf) - (hk ** 2 * sigma ** 2) / 2;
    return {
      rows: [
        R('Kelly Optimal', `${k.toFixed(3)}x`, 'brand'),
        R('Half Kelly', `${hk.toFixed(3)}x`, 'muted'),
        R('Kelly Expected CAGR', fmtPct(oc)),
        R('Half Kelly Expected CAGR', fmtPct(hc)),
      ],
    };
  },
});
const OptionLeverage = createCalculator({
  icon: Flame,
  title: 'Option Leverage Calculator',
  fields: [
    { key: 'spotPrice', label: 'Underlying Price', default: 100, step: 1 },
    { key: 'strikePrice', label: 'Strike Price', default: 105, step: 1 },
    { key: 'optionPrice', label: 'Option Price', default: 5, step: 0.5 },
    { key: 'impliedVol', label: 'Implied Volatility', default: 25, suffix: '%', step: 1 },
    { key: 'daysToExpiry', label: 'Days to Expiry', default: 30, suffix: 'd', step: 1, min: 1 },
  ],
  info: 'Option Formula: Leverage Ratio = (Black-Scholes Delta × Underlying Price) / Option Price',
  compute: (s) => {
    const sp = s.spotPrice,
      st = s.strikePrice,
      op = s.optionPrice,
      ok = op > 0 && sp > 0,
      sg = s.impliedVol / 100,
      tq = s.daysToExpiry / 365,
      sq = Math.sqrt(tq),
      bs = ok && sg > 0 && sq > 0 && st > 0,
      d1 = bs ? (Math.log(sp / st) + (sg ** 2 * tq) / 2) / (sg * sq) : 0,
      delta = bs ? normCdf(d1) : 0,
      intr = ok ? Math.max(sp - st, 0) : 0,
      tv = ok ? op - intr : 0,
      lev = ok ? (delta * sp) / op : 0;
    return {
      rows: [
        R('Leverage Ratio', `${lev.toFixed(2)}x`, 'brand'),
        R('Approximate Delta', delta.toFixed(4), 'muted'),
        R('Intrinsic Value', intr.toFixed(2)),
        R('Time Value', tv.toFixed(2)),
      ],
    };
  },
});
const TwoFund = createCalculator({
  icon: PieChart,
  title: 'Two-Fund Calculator',
  fields: [
    { key: 'cagrA', label: 'Asset A CAGR', default: 8, suffix: '%' },
    { key: 'volA', label: 'Asset A Volatility', default: 15, suffix: '%' },
    { key: 'cagrB', label: 'Asset B CAGR', default: 4, suffix: '%' },
    { key: 'volB', label: 'Asset B Volatility', default: 5, suffix: '%' },
  ],
  extra: correlationExtra,
  compute: (s, t) => {
    const muA = s.cagrA / 100,
      muB = s.cagrB / 100,
      sA = s.volA / 100,
      sB = s.volB / 100,
      rho = s.corr ?? 0.2,
      cov = rho * sA * sB,
      denom = sA ** 2 + sB ** 2 - 2 * cov,
      mwA = Math.max(0, Math.min(1, denom !== 0 ? (sB ** 2 - cov) / denom : 0.5)),
      pv = (a: number, b: number) =>
        Math.sqrt(a ** 2 * sA ** 2 + b ** 2 * sB ** 2 + 2 * a * b * cov),
      mvc = (mwA * muA + (1 - mwA) * muB) * 100,
      mvv = pv(mwA, 1 - mwA) * 100;
    const frontier = Array.from({ length: 51 }, (_, i) => {
      const wA = i / 50,
        wB = 1 - wA;
      return { wA, cagr: (wA * muA + wB * muB) * 100, vol: pv(wA, wB) * 100 };
    });
    return {
      rowsClassName: 'mt-1',
      rows: [
        R('Min Variance Weight', `${(mwA * 100).toFixed(1)}%`, 'brand'),
        R('Min Variance CAGR', `${mvc.toFixed(2)}%`),
        R('Min Variance Volatility', `${mvv.toFixed(2)}%`),
      ],
      chart: (
        <MiniChart
          type="line"
          data={frontier}
          xDataKey="vol"
          xType="number"
          xLabel={t('Volatility')}
          yLabel="CAGR"
          xTickFormatter={(v) => `${Number(v).toFixed(1)}%`}
          yTickFormatter={(v) => `${v.toFixed(1)}%`}
          tooltipFormatter={(v, name) => [`${v.toFixed(2)}%`, name === 'cagr' ? 'CAGR' : name]}
          tooltipLabelFormatter={(l) =>
            t('Volatility: {{value}}', { value: `${Number(l).toFixed(2)}%` })
          }
          series={[{ dataKey: 'cagr', color: getPortfolioColor(0), width: 2 }]}
        />
      ),
    };
  },
});
export default function CalculatorsPage() {
  const { t } = useTranslation();
  const grid = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <CAGR />
      <FutureValue />
      <LeverageDecay />
      <SWR />
      <AssetAllocationRisk />
      <CAGRAssumption />
      <LeverageETF />
      <KellyLeverage />
      <TwoFund />
      <OptionLeverage />
    </div>
  );
  return (
    <div className="page-container flex flex-col gap-3 pb-4">
      <h1 className="text-page-title text-fg">{t('Investment Calculators')}</h1>
      <ToolPageLayout params={grid} />
    </div>
  );
}
