import { useState, useMemo } from 'react';
import { ShieldAlert, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CalcCard, Field, SWRChart } from './BaseCalculatorUI.js';
import { formatPct } from './baseCalculatorUtils.js';
export function SWRCalculator() {
  const { t } = useTranslation();
  const [expectedReturn, setExpectedReturn] = useState(7);
  const [volatility, setVolatility] = useState(15);
  const [retirementYears, setRetirementYears] = useState(30);
  const [successTarget, setSuccessTarget] = useState(95);
  const swr = useMemo(() => {
    const mu = expectedReturn / 100;
    const sigma = volatility / 100;
    const T = retirementYears;
    const pTarget = successTarget / 100;
    const zScore = 1.645 + (pTarget - 0.95) * 10 * 0.842;
    const baseRate = mu - 0.5 * sigma * sigma;
    const safetyMargin = (zScore * sigma) / Math.sqrt(T);
    const estimatedSWR = Math.max(0, baseRate - safetyMargin);
    return Math.min(estimatedSWR, 0.1);
  }, [expectedReturn, volatility, retirementYears, successTarget]);
  const portfolioSurvival = useMemo(() => {
    const wr = swr;
    const pts: Array<{ year: number; ratio: number }> = [];
    let ratio = 1;
    for (let t = 1; t <= retirementYears; t++) {
      ratio = ratio * (1 + expectedReturn / 100) * (1 - wr);
      pts.push({ year: t, ratio });
    }
    return pts;
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
        { label: t('Estimated SWR'), value: formatPct(swr), tone: 'brand' },
        { label: t('Annual Withdrawal'), value: (swr * 1000000).toFixed(0), tone: 'success' },
      ]}
      chart={<SWRChart data={portfolioSurvival} />}
      info={t(
        'Formula: SWR ≈ (Expected Return - Risk Premium × Volatility²) / (1 + Risk Premium × Volatility²)',
      )}
    />
  );
}
interface AllocationRiskComputation {
  portfolioVol: number;
  diversificationBenefit: number;
  riskContributionStock: number;
  riskContributionBond: number;
}
function computeAllocationRisk(
  stockPct: number,
  bondPct: number,
  stockVol: number,
  bondVol: number,
  correlation: number,
): AllocationRiskComputation {
  const wS = stockPct / 100;
  const wB = bondPct / 100;
  const sS = stockVol / 100;
  const sB = bondVol / 100;
  const rho = correlation;
  const portfolioVol = Math.sqrt(
    wS * wS * sS * sS + wB * wB * sB * sB + 2 * wS * wB * rho * sS * sB,
  );
  const diversificationBenefit = wS * sS + wB * sB - portfolioVol;
  const riskContributionStock =
    (wS * wS * sS * sS + wS * wB * rho * sS * sB) / (portfolioVol * portfolioVol);
  const riskContributionBond =
    (wB * wB * sB * sB + wS * wB * rho * sS * sB) / (portfolioVol * portfolioVol);
  return { portfolioVol, diversificationBenefit, riskContributionStock, riskContributionBond };
}
export function AssetAllocationRiskCalculator() {
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
        { label: t('Portfolio Volatility'), value: formatPct(result.portfolioVol), tone: 'brand' },
        {
          label: t('Diversification Benefit'),
          value: formatPct(result.diversificationBenefit),
          tone: 'success',
        },
        { label: t('Stock Risk Contribution'), value: formatPct(result.riskContributionStock) },
        { label: t('Bond Risk Contribution'), value: formatPct(result.riskContributionBond) },
      ]}
      info={t('Formula: σp = √(ws²σs² + wb²σb² + 2wswbσsσbρ)')}
    />
  );
}
