import { useState, useMemo, useId } from 'react';
import type { ElementType, ReactNode } from 'react';
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

type SetState = React.Dispatch<React.SetStateAction<Record<string, number>>>;

function computeTwoFundFrontier(
  cagrA: number,
  volA: number,
  cagrB: number,
  volB: number,
  corr: number,
) {
  const muA = cagrA / 100,
    muB = cagrB / 100,
    sA = volA / 100,
    sB = volB / 100,
    rho = corr;
  const pts: Array<{ wA: number; cagr: number; vol: number }> = [];
  for (let w = 0; w <= 100; w += 2) {
    const wA = w / 100,
      wB = 1 - wA;
    pts.push({
      wA,
      cagr: (wA * muA + wB * muB) * 100,
      vol: Math.sqrt(wA * wA * sA * sA + wB * wB * sB * sB + 2 * wA * wB * rho * sA * sB) * 100,
    });
  }
  const covAB = rho * sA * sB,
    denom = sA * sA + sB * sB - 2 * covAB;
  let mwA = denom !== 0 ? (sB * sB - covAB) / denom : 0.5;
  mwA = Math.max(0, Math.min(1, mwA));
  return {
    frontier: pts,
    minVarW: mwA,
    minVarCagr: (mwA * muA + (1 - mwA) * muB) * 100,
    minVarVol:
      Math.sqrt(mwA * mwA * sA * sA + (1 - mwA) ** 2 * sB * sB + 2 * mwA * (1 - mwA) * covAB) * 100,
  };
}

function computeFutureValue(initial: number, cagr: number, years: number, monthly: number) {
  const r = cagr / 100,
    monthlyR = r / 12,
    months = years * 12;
  const pts: Array<{ year: number; value: number }> = [];
  let acc = initial;
  for (let t = 0; t <= months; t++) {
    if (t % 12 === 0) pts.push({ year: t / 12, value: acc });
    if (t < months) acc = acc * (1 + monthlyR) + monthly;
  }
  return { finalValue: acc, totalContributions: initial + monthly * months, curve: pts };
}

function computeAllocationRisk(
  stockPct: number,
  bondPct: number,
  stockVol: number,
  bondVol: number,
  correlation: number,
) {
  const wS = stockPct / 100,
    wB = bondPct / 100,
    sS = stockVol / 100,
    sB = bondVol / 100,
    rho = correlation;
  const pV = Math.sqrt(wS ** 2 * sS ** 2 + wB ** 2 * sB ** 2 + 2 * wS * wB * rho * sS * sB);
  const pV2 = pV * pV;
  return {
    portfolioVol: pV,
    diversificationBenefit: wS * sS + wB * sB - pV,
    riskContributionStock: (wS ** 2 * sS ** 2 + wS * wB * rho * sS * sB) / pV2,
    riskContributionBond: (wB ** 2 * sB ** 2 + wS * wB * rho * sS * sB) / pV2,
  };
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1,
    a = Math.abs(x),
    t = 1 / (1 + 0.3275911 * a);
  return (
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-a * a))
  );
}
function normCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function computeOptionLeverage(
  spotPrice: number,
  strikePrice: number,
  optionPrice: number,
  impliedVol: number,
  daysToExpiry: number,
) {
  if (optionPrice <= 0 || spotPrice <= 0)
    return { leverage: 0, delta: 0, intrinsic: 0, timeValue: 0 };
  const intrinsic = Math.max(spotPrice - strikePrice, 0);
  const sigma = impliedVol / 100,
    sqrtT = Math.sqrt(daysToExpiry / 365);
  const d1 =
    sigma > 0 && sqrtT > 0 && strikePrice > 0
      ? (Math.log(spotPrice / strikePrice) + (sigma ** 2 * (daysToExpiry / 365)) / 2) /
        (sigma * sqrtT)
      : 0;
  const delta = normCdf(d1);
  return {
    leverage: (delta * spotPrice) / optionPrice,
    delta,
    intrinsic,
    timeValue: optionPrice - intrinsic,
  };
}

function Field({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
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

type ResultTone = 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'default';
const TONE_CLASS: Record<ResultTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-fg-secondary',
  default: 'text-fg',
};
function ResultRow({
  label,
  value,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: ResultTone;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-label text-fg-tertiary">{label}</span>
      <span className={cn('font-mono tabular-nums text-label font-semibold', TONE_CLASS[tone])}>
        {value}
      </span>
    </div>
  );
}
function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 rounded-md bg-input-bg p-3 text-caption leading-relaxed text-fg-tertiary">
      {children}
    </div>
  );
}

function CalcCard({
  icon: Icon,
  title,
  defaultOpen = false,
  cols = 2,
  fields = [],
  extra,
  rows = [],
  rowsClassName = 'mt-3',
  chart,
  info,
}: {
  icon: ElementType;
  title: string;
  defaultOpen?: boolean;
  cols?: 2 | 3;
  fields?: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    suffix?: string;
    min?: number;
    max?: number;
    step?: number;
  }[];
  extra?: ReactNode;
  rows?: { label: string; value: string; tone?: ResultTone }[];
  rowsClassName?: string;
  chart?: ReactNode;
  info?: string;
}) {
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
          <div className="p-4 pt-0">
            {fields.length > 0 && (
              <div className={cols === 3 ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}>
                {fields.map((f) => (
                  <Field key={f.label} {...f} />
                ))}
              </div>
            )}
            {extra && <div className="mt-3">{extra}</div>}
            {rows.length > 0 && (
              <div className={rowsClassName}>
                {rows.map((r) => (
                  <ResultRow key={r.label} {...r} />
                ))}
              </div>
            )}
            {chart}
            {info && <InfoBox>{info}</InfoBox>}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function MiniChart({
  type = 'area',
  ...props
}: { type?: 'area' | 'line' } & Parameters<typeof SimpleAreaChart>[0]) {
  const Chart = type === 'line' ? SimpleLineChart : SimpleAreaChart;
  return (
    <div className="mt-3">
      <Chart {...props} />
    </div>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;
interface CalcResult {
  rows: { label: string; value: string; tone?: ResultTone }[];
  chart?: ReactNode;
  info?: string;
  extra?: ReactNode;
  rowsClassName?: string;
}
interface CalcConfig {
  icon: ElementType;
  title: string;
  defaultOpen?: boolean;
  cols?: 2 | 3;
  fields: {
    key: string;
    label: string;
    default: number;
    suffix?: string;
    step?: number;
    min?: number;
    max?: number;
  }[];
  info?: string;
  extra?: (state: Record<string, number>, setState: SetState) => ReactNode;
  compute: (state: Record<string, number>, t: TFn) => CalcResult;
}

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

function createCalculator(config: CalcConfig) {
  return function Calculator() {
    const { t } = useTranslation();
    const [state, setState] = useState<Record<string, number>>(() =>
      Object.fromEntries(config.fields.map((f) => [f.key, f.default])),
    );
    const result = useMemo(() => config.compute(state, t), [state, t]);
    return (
      <CalcCard
        icon={config.icon}
        title={t(config.title)}
        defaultOpen={config.defaultOpen}
        cols={config.cols}
        fields={config.fields.map((f) => ({
          label: t(f.label),
          value: state[f.key],
          onChange: (v: number) => setState((prev) => ({ ...prev, [f.key]: v })),
          suffix: f.suffix ? t(f.suffix) : undefined,
          step: f.step,
          min: f.min,
          max: f.max,
        }))}
        extra={config.extra?.(state, setState)}
        rows={result.rows}
        rowsClassName={result.rowsClassName}
        chart={result.chart}
        info={result.info ? t(result.info) : undefined}
      />
    );
  };
}

const CAGR = createCalculator({
  icon: TrendingUp,
  title: 'CAGR Calculator',
  defaultOpen: true,
  cols: 3,
  fields: [
    { key: 'initial', label: 'Initial Value', default: 10000, step: 1000, min: 0 },
    { key: 'finalVal', label: 'Final Value', default: 50000, step: 1000, min: 0 },
    { key: 'years', label: 'Years', default: 10, suffix: 'y', step: 1, min: 1 },
  ],
  info: 'Formula: CAGR = (Final Value / Initial Value)^(1 / Years) - 1',
  compute: (s) => {
    const cagr =
      s.initial > 0 && s.years > 0 ? Math.pow(s.finalVal / s.initial, 1 / s.years) - 1 : 0;
    return { rows: [{ label: 'CAGR', value: fmtPct(cagr), tone: 'brand' }] };
  },
});

const FutureValue = createCalculator({
  icon: DollarSign,
  title: 'Future Value Calculation',
  defaultOpen: true,
  fields: [
    { key: 'initial', label: 'Initial Value', default: 10000, step: 1000, min: 0 },
    { key: 'cagr', label: 'CAGR', default: 8, suffix: '%', step: 0.5 },
    { key: 'years', label: 'Years', default: 20, suffix: 'y', step: 1, min: 1 },
    { key: 'monthly', label: 'Monthly Contribution', default: 500, step: 100, min: 0 },
  ],
  compute: (s, t) => {
    const { finalValue, totalContributions, curve } = computeFutureValue(
      s.initial,
      s.cagr,
      s.years,
      s.monthly,
    );
    return {
      rows: [
        { label: 'Final Value', value: fmtCompact(finalValue), tone: 'brand' },
        { label: 'Total Contribution', value: fmtCompact(totalContributions) },
        {
          label: 'Investment Gain',
          value: fmtCompact(finalValue - totalContributions),
          tone: 'success',
        },
      ],
      chart: (
        <MiniChart
          type="area"
          data={curve}
          height={240}
          xDataKey="year"
          showLegend={false}
          xTickInterval="preserveStartEnd"
          yTickFormatter={fmtCompact}
          tooltipFormatter={(v: number) => [fmtCompact(v), t('Final Value')]}
          series={[{ dataKey: 'value', color: getPortfolioColor(0), width: 2, areaOpacity: 0.12 }]}
        />
      ),
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
    const r = s.cagr / 100;
    const curve = Array.from({ length: s.years + 1 }, (_, i) => ({
      year: i,
      value: s.initial * Math.pow(1 + r, i),
    }));
    return {
      rows: [{ label: 'Final Value', value: fmtCompact(curve[s.years].value), tone: 'brand' }],
      chart: (
        <MiniChart
          type="area"
          data={curve}
          height={200}
          xDataKey="year"
          showLegend={false}
          xTickInterval="preserveStartEnd"
          yTickFormatter={fmtCompact}
          tooltipFormatter={(v: number) => [fmtCompact(v), t('Final Value')]}
          series={[{ dataKey: 'value', color: getPortfolioColor(0), width: 2, areaOpacity: 0.12 }]}
        />
      ),
    };
  },
});

const SWR = createCalculator({
  icon: ShieldAlert,
  title: 'Safe Withdrawal Rate (SWR) Calculator',
  fields: [
    { key: 'expectedReturn', label: 'Expected Return', default: 7, suffix: '%', step: 0.5 },
    { key: 'volatility', label: 'Volatility', default: 15, suffix: '%', step: 1 },
    {
      key: 'retirementYears',
      label: 'Retirement Years',
      default: 30,
      suffix: 'y',
      step: 1,
      min: 1,
    },
    {
      key: 'successTarget',
      label: 'Success Target',
      default: 95,
      suffix: '%',
      step: 1,
      min: 50,
      max: 99,
    },
  ],
  info: 'Formula: SWR ≈ (Expected Return - Risk Premium × Volatility²) / (1 + Risk Premium × Volatility²)',
  compute: (s, t) => {
    const mu = s.expectedReturn / 100,
      sigma = s.volatility / 100,
      pTarget = s.successTarget / 100;
    const swr = Math.min(
      Math.max(
        mu -
          0.5 * sigma ** 2 -
          ((1.645 + (pTarget - 0.95) * 10 * 0.842) * sigma) / Math.sqrt(s.retirementYears),
        0,
      ),
      0.1,
    );
    let r = 1;
    const pts = Array.from({ length: s.retirementYears }, (_, i) => {
      r *= (1 + s.expectedReturn / 100) * (1 - swr);
      return { year: i + 1, ratio: r };
    });
    return {
      rows: [
        { label: t('Estimated SWR'), value: fmtPct(swr), tone: 'brand' },
        {
          label: t('Annual Withdrawal (per $1M)'),
          value: String(Math.round(swr * 1_000_000)),
          tone: 'success',
        },
      ],
      chart: (
        <MiniChart
          type="area"
          data={pts}
          height={160}
          xDataKey="year"
          showLegend={false}
          yTickFormatter={(v) => v.toFixed(1)}
          tooltipFormatter={(v: number) => [v.toFixed(3), t('Asset Ratio')]}
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
    {
      key: 'stockPct',
      label: 'Stock Percentage',
      default: 60,
      suffix: '%',
      step: 5,
      min: 0,
      max: 100,
    },
    {
      key: 'bondPct',
      label: 'Bond Percentage',
      default: 40,
      suffix: '%',
      step: 5,
      min: 0,
      max: 100,
    },
    { key: 'stockVol', label: 'Stock Volatility', default: 18, suffix: '%', step: 1 },
    { key: 'bondVol', label: 'Bond Volatility', default: 5, suffix: '%', step: 1 },
  ],
  info: 'Formula: σp = √(ws²σs² + wb²σb² + 2wswbσsσbρ)',
  extra: correlationExtra,
  compute: (s) => {
    const r = computeAllocationRisk(s.stockPct, s.bondPct, s.stockVol, s.bondVol, s.corr ?? 0.2);
    return {
      rowsClassName: 'mt-2',
      rows: [
        { label: 'Portfolio Volatility', value: fmtPct(r.portfolioVol), tone: 'brand' },
        {
          label: 'Diversification Benefit',
          value: fmtPct(r.diversificationBenefit),
          tone: 'success',
        },
        { label: 'Stock Risk Contribution', value: fmtPct(r.riskContributionStock) },
        { label: 'Bond Risk Contribution', value: fmtPct(r.riskContributionBond) },
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
      l = s.leverage;
    const volDrag = ((l ** 2 - l) * sigma ** 2) / 2;
    const totalDecay = 1 - Math.pow(1 - volDrag, s.years);
    return {
      rows: [
        { label: t('Annual Volatility Drag'), value: fmtPct(volDrag), tone: 'warning' },
        {
          label: t('{{years}}-Year Total Decay', { years: s.years }),
          value: fmtPct(totalDecay),
          tone: 'danger',
        },
        { label: t('Effective Loss'), value: fmtPct(-totalDecay), tone: 'danger' },
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
      rBorrow = s.borrowSpread / 100;
    const levCagr = l * mu - (l - 1) * rBorrow - ((l ** 2 - l) * sigma ** 2) / 2;
    const levVol = l * sigma;
    return {
      rows: [
        { label: 'Leveraged CAGR', value: fmtPct(levCagr), tone: 'brand' },
        { label: 'Leveraged Volatility', value: fmtPct(levVol), tone: 'warning' },
        { label: 'Leveraged Sharpe', value: (levCagr / levVol).toFixed(3) },
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
      rf = s.riskFree / 100;
    const kelly = (mu - rf) / sigma ** 2,
      halfKelly = kelly / 2;
    const optCagr = rf + kelly * (mu - rf) - (kelly ** 2 * sigma ** 2) / 2;
    const halfCagr = rf + halfKelly * (mu - rf) - (halfKelly ** 2 * sigma ** 2) / 2;
    return {
      rows: [
        { label: 'Kelly Optimal', value: `${kelly.toFixed(3)}x`, tone: 'brand' },
        { label: 'Half Kelly', value: `${halfKelly.toFixed(3)}x`, tone: 'muted' },
        { label: 'Kelly Expected CAGR', value: fmtPct(optCagr) },
        { label: 'Half Kelly Expected CAGR', value: fmtPct(halfCagr) },
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
    const r = computeOptionLeverage(
      s.spotPrice,
      s.strikePrice,
      s.optionPrice,
      s.impliedVol,
      s.daysToExpiry,
    );
    return {
      rows: [
        { label: 'Leverage Ratio', value: `${r.leverage.toFixed(2)}x`, tone: 'brand' },
        { label: 'Approximate Delta', value: r.delta.toFixed(4), tone: 'muted' },
        { label: 'Intrinsic Value', value: r.intrinsic.toFixed(2) },
        { label: 'Time Value', value: r.timeValue.toFixed(2) },
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
    const { frontier, minVarW, minVarCagr, minVarVol } = computeTwoFundFrontier(
      s.cagrA,
      s.volA,
      s.cagrB,
      s.volB,
      s.corr ?? 0.2,
    );
    return {
      rowsClassName: 'mt-1',
      rows: [
        { label: 'Min Variance Weight', value: `${(minVarW * 100).toFixed(1)}%`, tone: 'brand' },
        { label: 'Min Variance CAGR', value: `${minVarCagr.toFixed(2)}%` },
        { label: 'Min Variance Volatility', value: `${minVarVol.toFixed(2)}%` },
      ],
      chart: (
        <MiniChart
          type="line"
          data={frontier}
          height={220}
          xDataKey="vol"
          xType="number"
          xLabel={t('Volatility')}
          yLabel="CAGR"
          showLegend={false}
          xTickFormatter={(v) => `${Number(v).toFixed(1)}%`}
          yTickFormatter={(v) => `${v.toFixed(1)}%`}
          tooltipFormatter={(v: number, name: string) => [
            `${v.toFixed(2)}%`,
            name === 'cagr' ? 'CAGR' : name,
          ]}
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
  return (
    <div className="page-container flex flex-col gap-3 pb-4">
      <h1 className="text-page-title text-fg">{t('Investment Calculators')}</h1>
      <ToolPageLayout
        params={
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
        }
      />
    </div>
  );
}
