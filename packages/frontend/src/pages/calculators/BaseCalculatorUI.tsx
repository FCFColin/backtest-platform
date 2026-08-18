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
function formatNum(v: number) {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(2);
}
interface TwoFundFrontierResult {
  frontier: Array<{ wA: number; cagr: number; vol: number }>;
  minVarW: number;
  minVarCagr: number;
  minVarVol: number;
}
function computeTwoFundFrontier(
  cagrA: number,
  volA: number,
  cagrB: number,
  volB: number,
  corr: number,
): TwoFundFrontierResult {
  const muA = cagrA / 100;
  const muB = cagrB / 100;
  const sA = volA / 100;
  const sB = volB / 100;
  const rho = corr;
  const pts: Array<{ wA: number; cagr: number; vol: number }> = [];
  for (let w = 0; w <= 100; w += 2) {
    const wA = w / 100;
    const wB = 1 - wA;
    const pCagr = wA * muA + wB * muB;
    const pVol = Math.sqrt(wA * wA * sA * sA + wB * wB * sB * sB + 2 * wA * wB * rho * sA * sB);
    pts.push({ wA, cagr: pCagr * 100, vol: pVol * 100 });
  }
  const covAB = rho * sA * sB;
  const denom = sA * sA + sB * sB - 2 * covAB;
  let mwA = denom !== 0 ? (sB * sB - covAB) / denom : 0.5;
  mwA = Math.max(0, Math.min(1, mwA));
  const mvCagr = (mwA * muA + (1 - mwA) * muB) * 100;
  const mvVol =
    Math.sqrt(mwA * mwA * sA * sA + (1 - mwA) * (1 - mwA) * sB * sB + 2 * mwA * (1 - mwA) * covAB) *
    100;
  return { frontier: pts, minVarW: mwA, minVarCagr: mvCagr, minVarVol: mvVol };
}
import { SimpleLineChart, SimpleAreaChart } from '@/components/charts/sharedChartContent.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { fmtPct } from '@/utils/format';
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
const RESULT_TONE_CLASS: Record<ResultTone, string> = {
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
      <span
        className={cn('font-mono tabular-nums text-label font-semibold', RESULT_TONE_CLASS[tone])}
      >
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
function CollapsibleCard({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: ElementType;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
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
          <div className="p-4 pt-0">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
function CalcCard({
  icon,
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
  return (
    <CollapsibleCard icon={icon} title={title} defaultOpen={defaultOpen}>
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
    </CollapsibleCard>
  );
}
function SWRChart({ data }: { data: Array<{ year: number; ratio: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <SimpleAreaChart
        data={data}
        height={160}
        xDataKey="year"
        showLegend={false}
        yTickFormatter={(v) => v.toFixed(1)}
        tooltipFormatter={(v: number) => [v.toFixed(3), t('Asset Ratio')]}
        series={[{ dataKey: 'ratio', color: getPortfolioColor(2), width: 2, areaOpacity: 0.12 }]}
      />
    </div>
  );
}
function TwoFundChart({ data }: { data: Array<{ wA: number; cagr: number; vol: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <SimpleLineChart
        data={data}
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
    </div>
  );
}
function ValueCurveChart({
  curve,
  height,
}: {
  curve: Array<{ year: number; value: number }>;
  height: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <SimpleAreaChart
        data={curve}
        height={height}
        xDataKey="year"
        showLegend={false}
        xTickInterval="preserveStartEnd"
        yTickFormatter={formatNum}
        tooltipFormatter={(v: number) => [formatNum(v), t('Final Value')]}
        series={[{ dataKey: 'value', color: getPortfolioColor(0), width: 2, areaOpacity: 0.12 }]}
      />
    </div>
  );
}
function CAGRCalculator() {
  const { t } = useTranslation();
  const [initial, setInitial] = useState(10000);
  const [finalVal, setFinalVal] = useState(50000);
  const [years, setYears] = useState(10);
  const cagr = useMemo(() => {
    if (initial <= 0 || years <= 0) return 0;
    return Math.pow(finalVal / initial, 1 / years) - 1;
  }, [initial, finalVal, years]);
  return (
    <CalcCard
      icon={TrendingUp}
      title={t('CAGR Calculator')}
      defaultOpen
      cols={3}
      fields={[
        { label: t('Initial Value'), value: initial, onChange: setInitial, step: 1000, min: 0 },
        { label: t('Final Value'), value: finalVal, onChange: setFinalVal, step: 1000, min: 0 },
        { label: t('Years'), value: years, onChange: setYears, suffix: t('y'), step: 1, min: 1 },
      ]}
      rows={[{ label: 'CAGR', value: fmtPct(cagr), tone: 'brand' }]}
      info={t('Formula: CAGR = (Final Value / Initial Value)^(1 / Years) - 1')}
    />
  );
}
function computeFutureValue(initial: number, cagr: number, years: number, monthly: number) {
  const r = cagr / 100;
  const monthlyR = r / 12;
  const months = years * 12;
  const pts: Array<{ year: number; value: number }> = [];
  let accumulated = initial;
  for (let t = 0; t <= months; t++) {
    if (t % 12 === 0) {
      pts.push({ year: t / 12, value: accumulated });
    }
    if (t < months) {
      accumulated = accumulated * (1 + monthlyR) + monthly;
    }
  }
  const totalContrib = initial + monthly * months;
  return { finalValue: accumulated, totalContributions: totalContrib, curve: pts };
}
function FutureValueCalculator() {
  const { t } = useTranslation();
  const [initial, setInitial] = useState(10000);
  const [cagr, setCagr] = useState(8);
  const [years, setYears] = useState(20);
  const [monthly, setMonthly] = useState(500);
  const { finalValue, totalContributions, curve } = useMemo(
    () => computeFutureValue(initial, cagr, years, monthly),
    [initial, cagr, years, monthly],
  );
  return (
    <CalcCard
      icon={DollarSign}
      title={t('Future Value Calculation')}
      defaultOpen
      cols={2}
      fields={[
        { label: t('Initial Value'), value: initial, onChange: setInitial, step: 1000, min: 0 },
        { label: 'CAGR', value: cagr, onChange: setCagr, suffix: '%', step: 0.5 },
        { label: t('Years'), value: years, onChange: setYears, suffix: t('y'), step: 1, min: 1 },
        {
          label: t('Monthly Contribution'),
          value: monthly,
          onChange: setMonthly,
          step: 100,
          min: 0,
        },
      ]}
      rows={[
        { label: t('Final Value'), value: formatNum(finalValue), tone: 'brand' },
        { label: t('Total Contribution'), value: formatNum(totalContributions) },
        {
          label: t('Investment Gain'),
          value: formatNum(finalValue - totalContributions),
          tone: 'success',
        },
      ]}
      chart={<ValueCurveChart curve={curve} height={240} />}
    />
  );
}
function CAGRAssumptionCalculator() {
  const { t } = useTranslation();
  const [cagr, setCagr] = useState(8);
  const [years, setYears] = useState(20);
  const [initial, setInitial] = useState(10000);
  const { finalValue, curve } = useMemo(() => {
    const r = cagr / 100;
    const pts: Array<{ year: number; value: number }> = [];
    for (let t = 0; t <= years; t++) {
      pts.push({ year: t, value: initial * Math.pow(1 + r, t) });
    }
    return { finalValue: initial * Math.pow(1 + r, years), curve: pts };
  }, [cagr, years, initial]);
  return (
    <CalcCard
      icon={TrendingUp}
      title={t('Assumptions')}
      cols={2}
      fields={[
        { label: t('Expected Return'), value: cagr, onChange: setCagr, suffix: '%' },
        { label: t('Time'), value: years, onChange: setYears, suffix: t('y'), step: 1 },
        { label: t('Initial Capital'), value: initial, onChange: setInitial, step: 1000 },
      ]}
      rows={[{ label: t('Final Value'), value: formatNum(finalValue), tone: 'brand' }]}
      chart={<ValueCurveChart curve={curve} height={200} />}
    />
  );
}
function SWRCalculator() {
  const { t } = useTranslation();
  const [expectedReturn, setExpectedReturn] = useState(7);
  const [volatility, setVolatility] = useState(15);
  const [retirementYears, setRetirementYears] = useState(30);
  const [successTarget, setSuccessTarget] = useState(95);
  const swr = useMemo(() => {
    const mu = expectedReturn / 100,
      sigma = volatility / 100,
      T = retirementYears,
      pTarget = successTarget / 100;
    return Math.min(
      Math.max(
        mu - 0.5 * sigma * sigma - ((1.645 + (pTarget - 0.95) * 10 * 0.842) * sigma) / Math.sqrt(T),
        0,
      ),
      0.1,
    );
  }, [expectedReturn, volatility, retirementYears, successTarget]);
  const pts = useMemo(() => {
    const out: Array<{ year: number; ratio: number }> = [];
    let r = 1;
    for (let i = 1; i <= retirementYears; i++) {
      r = r * (1 + expectedReturn / 100) * (1 - swr);
      out.push({ year: i, ratio: r });
    }
    return out;
  }, [swr, expectedReturn, retirementYears]);
  return (
    <CalcCard
      icon={ShieldAlert}
      title={t('Safe Withdrawal Rate (SWR) Calculator')}
      cols={2}
      fields={[
        {
          label: t('Expected Return'),
          value: expectedReturn,
          onChange: setExpectedReturn,
          suffix: '%',
          step: 0.5,
        },
        {
          label: t('Volatility'),
          value: volatility,
          onChange: setVolatility,
          suffix: '%',
          step: 1,
        },
        {
          label: t('Retirement Years'),
          value: retirementYears,
          onChange: setRetirementYears,
          suffix: t('y'),
          step: 1,
          min: 1,
        },
        {
          label: t('Success Target'),
          value: successTarget,
          onChange: setSuccessTarget,
          suffix: '%',
          step: 1,
          min: 50,
          max: 99,
        },
      ]}
      rows={[
        { label: t('Estimated SWR'), value: fmtPct(swr), tone: 'brand' },
        {
          label: t('Annual Withdrawal (per $1M)'),
          value: String(Math.round(swr * 1_000_000)),
          tone: 'success',
        },
      ]}
      chart={<SWRChart data={pts} />}
      info={t(
        'Formula: SWR ≈ (Expected Return - Risk Premium × Volatility²) / (1 + Risk Premium × Volatility²)',
      )}
    />
  );
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
  const pV = Math.sqrt(wS * wS * sS * sS + wB * wB * sB * sB + 2 * wS * wB * rho * sS * sB);
  const pV2 = pV * pV;
  return {
    portfolioVol: pV,
    diversificationBenefit: wS * sS + wB * sB - pV,
    riskContributionStock: (wS * wS * sS * sS + wS * wB * rho * sS * sB) / pV2,
    riskContributionBond: (wB * wB * sB * sB + wS * wB * rho * sS * sB) / pV2,
  };
}
function AssetAllocationRiskCalculator() {
  const { t } = useTranslation();
  const [stockPct, setStockPct] = useState(60);
  const [bondPct, setBondPct] = useState(40);
  const [stockVol, setStockVol] = useState(18);
  const [bondVol, setBondVol] = useState(5);
  const [correlation, setCorrelation] = useState(0.2);
  const result = useMemo(
    () => computeAllocationRisk(stockPct, bondPct, stockVol, bondVol, correlation),
    [stockPct, bondPct, stockVol, bondVol, correlation],
  );
  return (
    <CalcCard
      icon={BarChart3}
      title={t('Risk Contribution Calculator')}
      cols={2}
      fields={[
        {
          label: t('Stock Percentage'),
          value: stockPct,
          onChange: setStockPct,
          suffix: '%',
          step: 5,
          min: 0,
          max: 100,
        },
        {
          label: t('Bond Percentage'),
          value: bondPct,
          onChange: setBondPct,
          suffix: '%',
          step: 5,
          min: 0,
          max: 100,
        },
        {
          label: t('Stock Volatility'),
          value: stockVol,
          onChange: setStockVol,
          suffix: '%',
          step: 1,
        },
        { label: t('Bond Volatility'), value: bondVol, onChange: setBondVol, suffix: '%', step: 1 },
      ]}
      extra={
        <Field
          label={t('Correlation')}
          value={correlation}
          onChange={setCorrelation}
          step={0.05}
          min={-1}
          max={1}
        />
      }
      rowsClassName="mt-2"
      rows={[
        { label: t('Portfolio Volatility'), value: fmtPct(result.portfolioVol), tone: 'brand' },
        {
          label: t('Diversification Benefit'),
          value: fmtPct(result.diversificationBenefit),
          tone: 'success',
        },
        { label: t('Stock Risk Contribution'), value: fmtPct(result.riskContributionStock) },
        { label: t('Bond Risk Contribution'), value: fmtPct(result.riskContributionBond) },
      ]}
      info={t('Formula: σp = √(ws²σs² + wb²σb² + 2wswbσsσbρ)')}
    />
  );
}
function LeverageDecayCalculator() {
  const { t } = useTranslation();
  const [baseVol, setBaseVol] = useState(18);
  const [leverage, setLeverage] = useState(3);
  const [years, setYears] = useState(10);
  const result = useMemo(() => {
    const sigma = baseVol / 100,
      l = leverage;
    const volDrag = ((l * l - l) * sigma * sigma) / 2;
    const totalDecay = 1 - Math.pow(1 - volDrag, years);
    return { volDrag, totalDecay, effectiveReturn: -totalDecay };
  }, [baseVol, leverage, years]);
  return (
    <CalcCard
      icon={Layers}
      title={t('Volatility Decay Calculator')}
      cols={3}
      fields={[
        {
          label: t('Asset Volatility'),
          value: baseVol,
          onChange: setBaseVol,
          suffix: '%',
          step: 1,
        },
        {
          label: t('Leverage Multiplier'),
          value: leverage,
          onChange: setLeverage,
          suffix: 'x',
          step: 0.5,
          min: 1,
        },
        {
          label: t('Holding Years'),
          value: years,
          onChange: setYears,
          suffix: t('y'),
          step: 1,
          min: 1,
        },
      ]}
      rows={[
        { label: t('Annual Volatility Drag'), value: fmtPct(result.volDrag), tone: 'warning' },
        {
          label: t('{{years}}-Year Total Decay', { years }),
          value: fmtPct(result.totalDecay),
          tone: 'danger',
        },
        { label: t('Effective Loss'), value: fmtPct(result.effectiveReturn), tone: 'danger' },
      ]}
      info={t('Decay Formula: Total Decay = (1 - (1 - Annual Drag)^Years) × 100%')}
    />
  );
}
function LeverageETFCalculator() {
  const { t } = useTranslation();
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [leverage, setLeverage] = useState(2);
  const [borrowSpread, setBorrowSpread] = useState(1);
  const result = useMemo(() => {
    const mu = baseCagr / 100,
      sigma = baseVol / 100,
      l = leverage,
      rBorrow = borrowSpread / 100;
    const levCagr = l * mu - (l - 1) * rBorrow - ((l * l - l) * sigma * sigma) / 2;
    return { levCagr, levVol: l * sigma };
  }, [baseCagr, baseVol, leverage, borrowSpread]);
  return (
    <CalcCard
      icon={Layers}
      title={t('Leveraged ETF Calculator')}
      cols={2}
      fields={[
        { label: t('Base CAGR'), value: baseCagr, onChange: setBaseCagr, suffix: '%' },
        { label: t('Base Volatility'), value: baseVol, onChange: setBaseVol, suffix: '%' },
        {
          label: t('Leverage Multiplier'),
          value: leverage,
          onChange: setLeverage,
          suffix: 'x',
          step: 0.5,
          min: 1,
        },
        { label: t('Borrow Spread'), value: borrowSpread, onChange: setBorrowSpread, suffix: '%' },
      ]}
      rows={[
        { label: t('Leveraged CAGR'), value: fmtPct(result.levCagr), tone: 'brand' },
        { label: t('Leveraged Volatility'), value: fmtPct(result.levVol), tone: 'warning' },
        { label: t('Leveraged Sharpe'), value: (result.levCagr / result.levVol).toFixed(3) },
      ]}
    />
  );
}
function KellyLeverageCalculator() {
  const { t } = useTranslation();
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [riskFree, setRiskFree] = useState(4);
  const result = useMemo(() => {
    const mu = baseCagr / 100,
      sigma = baseVol / 100,
      rf = riskFree / 100;
    const kelly = (mu - rf) / (sigma * sigma),
      halfKelly = kelly / 2;
    const optCagr = rf + kelly * (mu - rf) - (kelly * kelly * sigma * sigma) / 2;
    const halfCagr = rf + halfKelly * (mu - rf) - (halfKelly * halfKelly * sigma * sigma) / 2;
    return { kelly, halfKelly, optimalCagr: optCagr, halfKellyCagr: halfCagr };
  }, [baseCagr, baseVol, riskFree]);
  return (
    <CalcCard
      icon={Target}
      title={t('Kelly Formula Calculator')}
      cols={3}
      fields={[
        { label: t('Base CAGR'), value: baseCagr, onChange: setBaseCagr, suffix: '%' },
        { label: t('Volatility'), value: baseVol, onChange: setBaseVol, suffix: '%' },
        { label: t('Risk-Free Rate'), value: riskFree, onChange: setRiskFree, suffix: '%' },
      ]}
      rows={[
        { label: t('Kelly Optimal'), value: `${result.kelly.toFixed(3)}x`, tone: 'brand' },
        { label: t('Half Kelly'), value: `${result.halfKelly.toFixed(3)}x`, tone: 'muted' },
        { label: t('Kelly Expected CAGR'), value: fmtPct(result.optimalCagr) },
        { label: t('Half Kelly Expected CAGR'), value: fmtPct(result.halfKellyCagr) },
      ]}
      info={t('Kelly Formula: f* = (μ - r) / σ²')}
    />
  );
}
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1,
    a = Math.abs(x),
    t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return sign * y;
}
function normCdf(x: number): number {
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
  const timeValue = optionPrice - intrinsic;
  const sigma = impliedVol / 100,
    sqrtT = Math.sqrt(daysToExpiry / 365);
  const d1 =
    sigma > 0 && sqrtT > 0 && strikePrice > 0
      ? (Math.log(spotPrice / strikePrice) + (sigma * sigma * (daysToExpiry / 365)) / 2) /
        (sigma * sqrtT)
      : 0;
  const delta = normCdf(d1);
  return { leverage: (delta * spotPrice) / optionPrice, delta, intrinsic, timeValue };
}
function OptionLeverageCalculator() {
  const { t } = useTranslation();
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(105);
  const [optionPrice, setOptionPrice] = useState(5);
  const [impliedVol, setImpliedVol] = useState(25);
  const [daysToExpiry, setDaysToExpiry] = useState(30);
  const result = useMemo(
    () => computeOptionLeverage(spotPrice, strikePrice, optionPrice, impliedVol, daysToExpiry),
    [spotPrice, strikePrice, optionPrice, impliedVol, daysToExpiry],
  );
  return (
    <CalcCard
      icon={Flame}
      title={t('Option Leverage Calculator')}
      cols={2}
      fields={[
        { label: t('Underlying Price'), value: spotPrice, onChange: setSpotPrice, step: 1 },
        { label: t('Strike Price'), value: strikePrice, onChange: setStrikePrice, step: 1 },
        { label: t('Option Price'), value: optionPrice, onChange: setOptionPrice, step: 0.5 },
        {
          label: t('Implied Volatility'),
          value: impliedVol,
          onChange: setImpliedVol,
          suffix: '%',
          step: 1,
        },
        {
          label: t('Days to Expiry'),
          value: daysToExpiry,
          onChange: setDaysToExpiry,
          suffix: t('d'),
          step: 1,
          min: 1,
        },
      ]}
      rows={[
        { label: t('Leverage Ratio'), value: `${result.leverage.toFixed(2)}x`, tone: 'brand' },
        { label: t('Approximate Delta'), value: result.delta.toFixed(4), tone: 'muted' },
        { label: t('Intrinsic Value'), value: result.intrinsic.toFixed(2) },
        { label: t('Time Value'), value: result.timeValue.toFixed(2) },
      ]}
      info={t(
        'Option Formula: Leverage Ratio = (Black-Scholes Delta × Underlying Price) / Option Price',
      )}
    />
  );
}
function TwoFundPortfolioCalculator() {
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
    <CalcCard
      icon={PieChart}
      title={t('Two-Fund Calculator')}
      cols={2}
      fields={[
        { label: t('Asset A CAGR'), value: cagrA, onChange: setCagrA, suffix: '%' },
        { label: t('Asset A Volatility'), value: volA, onChange: setVolA, suffix: '%' },
        { label: t('Asset B CAGR'), value: cagrB, onChange: setCagrB, suffix: '%' },
        { label: t('Asset B Volatility'), value: volB, onChange: setVolB, suffix: '%' },
      ]}
      extra={
        <Field
          label={t('Correlation')}
          value={corr}
          onChange={setCorr}
          step={0.05}
          min={-1}
          max={1}
        />
      }
      rowsClassName="mt-1"
      rows={[
        { label: t('Min Variance Weight'), value: `${(minVarW * 100).toFixed(1)}%`, tone: 'brand' },
        { label: t('Min Variance CAGR'), value: `${minVarCagr.toFixed(2)}%` },
        { label: t('Min Variance Volatility'), value: `${minVarVol.toFixed(2)}%` },
      ]}
      chart={<TwoFundChart data={frontier} />}
    />
  );
}
export default function CalculatorsPage() {
  const { t } = useTranslation();
  return (
    <div className="page-container flex flex-col gap-3 pb-4">
      <h1 className="text-page-title text-fg">{t('Investment Calculators')}</h1>
      <ToolPageLayout
        params={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <CAGRCalculator />
            <FutureValueCalculator />
            <LeverageDecayCalculator />
            <SWRCalculator />
            <AssetAllocationRiskCalculator />
            <CAGRAssumptionCalculator />
            <LeverageETFCalculator />
            <KellyLeverageCalculator />
            <TwoFundPortfolioCalculator />
            <OptionLeverageCalculator />
          </div>
        }
      />
    </div>
  );
}
