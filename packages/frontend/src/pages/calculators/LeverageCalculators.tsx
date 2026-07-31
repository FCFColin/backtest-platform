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
    <CollapsibleCard icon={Layers} title={t('calculators.leverage.decayTitle')}>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('calculators.leverage.assetVolatility')} value={baseVol} onChange={setBaseVol} suffix="%" step={1} />
        <Field label={t('calculators.leverage.leverageMultiplier')} value={leverage} onChange={setLeverage} suffix="x" step={0.5} min={1} />
        <Field label={t('calculators.leverage.holdingYears')} value={years} onChange={setYears} suffix={t('calculators.leverage.yearSuffix')} step={1} min={1} />
      </div>
      <div className="mt-3">
        <ResultRow label={t('calculators.leverage.annualVolDrag')} value={formatPct(result.volDrag)} tone="warning" />
        <ResultRow label={t('calculators.leverage.yearsTotalDecay', { years })} value={formatPct(result.totalDecay)} tone="danger" />
        <ResultRow label={t('calculators.leverage.effectiveLoss')} value={formatPct(result.effectiveReturn)} tone="danger" />
      </div>
      <InfoBox>{t('calculators.leverage.decayFormula')}</InfoBox>
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
    <CollapsibleCard icon={Layers} title={t('calculators.leverage.etfTitle')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('calculators.leverage.baseCagr')} value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label={t('calculators.leverage.baseVolatility')} value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field label={t('calculators.leverage.leverageMultiplier')} value={leverage} onChange={setLeverage} suffix="x" step={0.5} min={1} />
        <Field label={t('calculators.leverage.borrowSpread')} value={borrowSpread} onChange={setBorrowSpread} suffix="%" />
      </div>
      <div className="mt-3">
        <ResultRow label={t('calculators.leverage.leveragedCagr')} value={formatPct(result.levCagr)} tone="brand" />
        <ResultRow label={t('calculators.leverage.leveragedVol')} value={formatPct(result.levVol)} tone="warning" />
        <ResultRow label={t('calculators.leverage.leveragedSharpe')} value={(result.levCagr / result.levVol).toFixed(3)} />
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
    <CollapsibleCard icon={Target} title={t('calculators.leverage.kellyTitle')}>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('calculators.leverage.baseCagr')} value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label={t('calculators.leverage.volatility')} value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field label={t('calculators.leverage.riskFreeRate')} value={riskFree} onChange={setRiskFree} suffix="%" />
      </div>
      <div className="mt-3">
        <ResultRow label={t('calculators.leverage.kellyOptimal')} value={`${result.kelly.toFixed(3)}x`} tone="brand" />
        <ResultRow label={t('calculators.leverage.halfKelly')} value={`${result.halfKelly.toFixed(3)}x`} tone="muted" />
        <ResultRow label={t('calculators.leverage.kellyExpectedCagr')} value={formatPct(result.optimalCagr)} />
        <ResultRow label={t('calculators.leverage.halfKellyExpectedCagr')} value={formatPct(result.halfKellyCagr)} />
      </div>
      <InfoBox>{t('calculators.leverage.kellyFormula')}</InfoBox>
    </CollapsibleCard>
  );
}
interface OptionLeverageComputation {
  leverage: number;
  delta: number;
  intrinsic: number;
  timeValue: number;
}
function computeOptionLeverage(spotPrice: number, strikePrice: number, optionPrice: number): OptionLeverageComputation {
  if (optionPrice <= 0 || spotPrice <= 0) return { leverage: 0, delta: 0, intrinsic: 0, timeValue: 0 };
  const intrinsic = Math.max(spotPrice - strikePrice, 0);
  const timeValue = optionPrice - intrinsic;
  const approxDelta = Math.min(1, Math.max(0.01, (optionPrice / spotPrice) * (spotPrice / optionPrice > 1 ? 1 : spotPrice / optionPrice)));
  const leverageRatio = (approxDelta * spotPrice) / (optionPrice > 0 ? optionPrice : 1);
  return { leverage: leverageRatio, delta: approxDelta, intrinsic, timeValue };
}
export function OptionLeverageCalculator() {
  const { t } = useTranslation();
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(105);
  const [optionPrice, setOptionPrice] = useState(5);
  const [contractMultiplier, setContractMultiplier] = useState(100);
  const result = useMemo(() => computeOptionLeverage(spotPrice, strikePrice, optionPrice), [spotPrice, strikePrice, optionPrice]);
  return (
    <CollapsibleCard icon={Flame} title={t('calculators.leverage.optionTitle')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('calculators.leverage.spotPrice')} value={spotPrice} onChange={setSpotPrice} step={1} />
        <Field label={t('calculators.leverage.strikePrice')} value={strikePrice} onChange={setStrikePrice} step={1} />
        <Field label={t('calculators.leverage.optionPrice')} value={optionPrice} onChange={setOptionPrice} step={0.5} />
        <Field label={t('calculators.leverage.contractMultiplier')} value={contractMultiplier} onChange={setContractMultiplier} step={1} />
      </div>
      <div className="mt-3">
        <ResultRow label={t('calculators.leverage.leverageRatio')} value={`${result.leverage.toFixed(2)}x`} tone="brand" />
        <ResultRow label={t('calculators.leverage.approxDelta')} value={result.delta.toFixed(4)} tone="muted" />
        <ResultRow label={t('calculators.leverage.intrinsicValue')} value={result.intrinsic.toFixed(2)} />
        <ResultRow label={t('calculators.leverage.timeValue')} value={result.timeValue.toFixed(2)} />
      </div>
      <InfoBox>{t('calculators.leverage.optionFormula')}</InfoBox>
    </CollapsibleCard>
  );
}
