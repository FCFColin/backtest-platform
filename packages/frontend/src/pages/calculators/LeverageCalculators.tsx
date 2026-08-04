import { useState, useMemo } from 'react';
import { Layers, Target, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, ResultRow, InfoBox, CollapsibleCard } from './BaseCalculatorUI.js';
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
    const totalDecay = volDrag * years;
    const effectiveReturn = -totalDecay;
    return { volDrag, totalDecay, effectiveReturn };
  }, [baseVol, leverage, years]);
  return (
    <CollapsibleCard icon={Layers} title={t('Volatility Decay Calculator')}>
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={t('Asset Volatility')}
          value={baseVol}
          onChange={setBaseVol}
          suffix="%"
          step={1}
        />
        <Field
          label={t('Leverage Multiplier')}
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          step={0.5}
          min={1}
        />
        <Field
          label={t('Holding Years')}
          value={years}
          onChange={setYears}
          suffix={t('y')}
          step={1}
          min={1}
        />
      </div>
      <div className="mt-3">
        <ResultRow
          label={t('Annual Volatility Drag')}
          value={formatPct(result.volDrag)}
          tone="warning"
        />
        <ResultRow
          label={t('{{years}}-Year Total Decay', { years })}
          value={formatPct(result.totalDecay)}
          tone="danger"
        />
        <ResultRow
          label={t('Effective Loss')}
          value={formatPct(result.effectiveReturn)}
          tone="danger"
        />
      </div>
      <InfoBox>{t('Decay Formula: Total Decay = (1 - (1 - Annual Drag)^Years) × 100%')}</InfoBox>
    </CollapsibleCard>
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
    <CollapsibleCard icon={Layers} title={t('Leveraged ETF Calculator')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Base CAGR')} value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label={t('Base Volatility')} value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field
          label={t('Leverage Multiplier')}
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          step={0.5}
          min={1}
        />
        <Field
          label={t('Borrow Spread')}
          value={borrowSpread}
          onChange={setBorrowSpread}
          suffix="%"
        />
      </div>
      <div className="mt-3">
        <ResultRow label={t('Leveraged CAGR')} value={formatPct(result.levCagr)} tone="brand" />
        <ResultRow
          label={t('Leveraged Volatility')}
          value={formatPct(result.levVol)}
          tone="warning"
        />
        <ResultRow
          label={t('Leveraged Sharpe')}
          value={(result.levCagr / result.levVol).toFixed(3)}
        />
      </div>
    </CollapsibleCard>
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
    <CollapsibleCard icon={Target} title={t('Kelly Formula Calculator')}>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('Base CAGR')} value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label={t('Volatility')} value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field label={t('Risk-Free Rate')} value={riskFree} onChange={setRiskFree} suffix="%" />
      </div>
      <div className="mt-3">
        <ResultRow label={t('Kelly Optimal')} value={`${result.kelly.toFixed(3)}x`} tone="brand" />
        <ResultRow label={t('Half Kelly')} value={`${result.halfKelly.toFixed(3)}x`} tone="muted" />
        <ResultRow label={t('Kelly Expected CAGR')} value={formatPct(result.optimalCagr)} />
        <ResultRow label={t('Half Kelly Expected CAGR')} value={formatPct(result.halfKellyCagr)} />
      </div>
      <InfoBox>{t('Kelly Formula: f* = (μ - r) / σ²')}</InfoBox>
    </CollapsibleCard>
  );
}
interface OptionLeverageComputation {
  leverage: number;
  delta: number;
  intrinsic: number;
  timeValue: number;
}
function computeOptionLeverage(
  spotPrice: number,
  strikePrice: number,
  optionPrice: number,
): OptionLeverageComputation {
  if (optionPrice <= 0 || spotPrice <= 0)
    return { leverage: 0, delta: 0, intrinsic: 0, timeValue: 0 };
  const intrinsic = Math.max(spotPrice - strikePrice, 0);
  const timeValue = optionPrice - intrinsic;
  const approxDelta = Math.min(
    1,
    Math.max(
      0.01,
      (optionPrice / spotPrice) * (spotPrice / optionPrice > 1 ? 1 : spotPrice / optionPrice),
    ),
  );
  const leverageRatio = (approxDelta * spotPrice) / (optionPrice > 0 ? optionPrice : 1);
  return { leverage: leverageRatio, delta: approxDelta, intrinsic, timeValue };
}
export function OptionLeverageCalculator() {
  const { t } = useTranslation();
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(105);
  const [optionPrice, setOptionPrice] = useState(5);
  const [contractMultiplier, setContractMultiplier] = useState(100);
  const result = useMemo(
    () => computeOptionLeverage(spotPrice, strikePrice, optionPrice),
    [spotPrice, strikePrice, optionPrice],
  );
  return (
    <CollapsibleCard icon={Flame} title={t('Option Leverage Calculator')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Underlying Price')} value={spotPrice} onChange={setSpotPrice} step={1} />
        <Field label={t('Strike Price')} value={strikePrice} onChange={setStrikePrice} step={1} />
        <Field label={t('Option Price')} value={optionPrice} onChange={setOptionPrice} step={0.5} />
        <Field
          label={t('Contract Multiplier')}
          value={contractMultiplier}
          onChange={setContractMultiplier}
          step={1}
        />
      </div>
      <div className="mt-3">
        <ResultRow
          label={t('Leverage Ratio')}
          value={`${result.leverage.toFixed(2)}x`}
          tone="brand"
        />
        <ResultRow label={t('Approximate Delta')} value={result.delta.toFixed(4)} tone="muted" />
        <ResultRow label={t('Intrinsic Value')} value={result.intrinsic.toFixed(2)} />
        <ResultRow label={t('Time Value')} value={result.timeValue.toFixed(2)} />
      </div>
      <InfoBox>
        {t(
          'Option Formula: Leverage Ratio = (Delta × Underlying Price + Option Price) / (Option Price × Contract Multiplier)',
        )}
      </InfoBox>
    </CollapsibleCard>
  );
}
