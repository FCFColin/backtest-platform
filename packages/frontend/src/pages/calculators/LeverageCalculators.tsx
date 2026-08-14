import { useState, useMemo } from 'react';
import { Layers, Target, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CalcCard } from './BaseCalculatorUI.js';
import { formatPct } from './baseCalculatorUtils.js';
export function LeverageDecayCalculator() {
  const { t } = useTranslation();
  const [baseVol, setBaseVol] = useState(18);
  const [leverage, setLeverage] = useState(3);
  const [years, setYears] = useState(10);
  const result = useMemo(() => {
    const sigma = baseVol / 100;
    const l = leverage;
    const volDrag = ((l * l - l) * sigma * sigma) / 2;
    // 复利累加：与 info 文案公式一致（年化拖累逐年复利）
    const totalDecay = 1 - Math.pow(1 - volDrag, years);
    const effectiveReturn = -totalDecay;
    return { volDrag, totalDecay, effectiveReturn };
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
        { label: t('Annual Volatility Drag'), value: formatPct(result.volDrag), tone: 'warning' },
        {
          label: t('{{years}}-Year Total Decay', { years }),
          value: formatPct(result.totalDecay),
          tone: 'danger',
        },
        { label: t('Effective Loss'), value: formatPct(result.effectiveReturn), tone: 'danger' },
      ]}
      info={t('Decay Formula: Total Decay = (1 - (1 - Annual Drag)^Years) × 100%')}
    />
  );
}
export function LeverageETFCalculator() {
  const { t } = useTranslation();
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [leverage, setLeverage] = useState(2);
  const [borrowSpread, setBorrowSpread] = useState(1);
  const result = useMemo(() => {
    const mu = baseCagr / 100;
    const sigma = baseVol / 100;
    const l = leverage;
    const rBorrow = borrowSpread / 100;
    const levCagr = l * mu - (l - 1) * rBorrow - ((l * l - l) * sigma * sigma) / 2;
    const levVol = l * sigma;
    return { levCagr, levVol };
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
        { label: t('Leveraged CAGR'), value: formatPct(result.levCagr), tone: 'brand' },
        { label: t('Leveraged Volatility'), value: formatPct(result.levVol), tone: 'warning' },
        {
          label: t('Leveraged Sharpe'),
          value: (result.levCagr / result.levVol).toFixed(3),
        },
      ]}
    />
  );
}
export function KellyLeverageCalculator() {
  const { t } = useTranslation();
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [riskFree, setRiskFree] = useState(4);
  const result = useMemo(() => {
    const mu = baseCagr / 100;
    const sigma = baseVol / 100;
    const rf = riskFree / 100;
    const kelly = (mu - rf) / (sigma * sigma);
    const halfKelly = kelly / 2;
    const optimalCagr = rf + kelly * (mu - rf) - (kelly * kelly * sigma * sigma) / 2;
    const halfKellyCagr = rf + halfKelly * (mu - rf) - (halfKelly * halfKelly * sigma * sigma) / 2;
    return { kelly, halfKelly, optimalCagr, halfKellyCagr };
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
        { label: t('Kelly Expected CAGR'), value: formatPct(result.optimalCagr) },
        { label: t('Half Kelly Expected CAGR'), value: formatPct(result.halfKellyCagr) },
      ]}
      info={t('Kelly Formula: f* = (μ - r) / σ²')}
    />
  );
}
interface OptionLeverageComputation {
  leverage: number;
  delta: number;
  intrinsic: number;
  timeValue: number;
}
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
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
// Black-Scholes 看涨期权 delta（r=0 简化），杠杆 = delta × S / P
function computeOptionLeverage(
  spotPrice: number,
  strikePrice: number,
  optionPrice: number,
  impliedVol: number,
  daysToExpiry: number,
): OptionLeverageComputation {
  if (optionPrice <= 0 || spotPrice <= 0)
    return { leverage: 0, delta: 0, intrinsic: 0, timeValue: 0 };
  const intrinsic = Math.max(spotPrice - strikePrice, 0);
  const timeValue = optionPrice - intrinsic;
  const sigma = impliedVol / 100;
  const sqrtT = Math.sqrt(daysToExpiry / 365);
  const d1 =
    sigma > 0 && sqrtT > 0 && strikePrice > 0
      ? (Math.log(spotPrice / strikePrice) + (sigma * sigma * (daysToExpiry / 365)) / 2) /
        (sigma * sqrtT)
      : 0;
  const delta = normCdf(d1);
  return { leverage: (delta * spotPrice) / optionPrice, delta, intrinsic, timeValue };
}
export function OptionLeverageCalculator() {
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
