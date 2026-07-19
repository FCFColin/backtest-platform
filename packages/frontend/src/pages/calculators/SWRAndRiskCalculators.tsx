import { useState, useMemo } from 'react';
import { ShieldAlert, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatPct } from './baseCalculatorUtils.js';
import { Field, ResultRow, CollapsibleCard, InfoBox, SWRChart } from './BaseCalculatorUI.js';

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
    <CollapsibleCard icon={ShieldAlert} title={t('calculators.swr.title')}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label={t('calculators.swr.expectedReturn')}
          value={expectedReturn}
          onChange={setExpectedReturn}
          suffix="%"
          step={0.5}
        />
        <Field
          label={t('calculators.swr.volatility')}
          value={volatility}
          onChange={setVolatility}
          suffix="%"
          step={1}
        />
        <Field
          label={t('calculators.swr.retirementYears')}
          value={retirementYears}
          onChange={setRetirementYears}
          suffix={t('calculators.swr.yearSuffix')}
          step={1}
          min={1}
        />
        <Field
          label={t('calculators.swr.successTarget')}
          value={successTarget}
          onChange={setSuccessTarget}
          suffix="%"
          step={1}
          min={50}
          max={99}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow
          label={t('calculators.swr.estimatedSwr')}
          value={formatPct(swr)}
          color="var(--brand)"
        />
        <ResultRow
          label={t('calculators.swr.annualWithdrawal')}
          value={(swr * 1000000).toFixed(0)}
          color="var(--success)"
        />
      </div>
      <SWRChart data={portfolioSurvival} />
      <InfoBox>{t('calculators.swr.formula')}</InfoBox>
    </CollapsibleCard>
  );
}

interface AllocationRiskComputation {
  portfolioVol: number;
  diversificationBenefit: number;
  riskContributionStock: number;
  riskContributionBond: number;
}

/** 计算资产配置风险指标（从组件抽出纯函数） */
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

/** 风险结果行 + 公式提示（从主组件抽出，控制行数） */
function RiskResults({
  result,
  t,
}: {
  result: AllocationRiskComputation;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <>
      <div style={{ marginTop: 8 }}>
        <ResultRow
          label={t('calculators.risk.portfolioVol')}
          value={formatPct(result.portfolioVol)}
          color="var(--brand)"
        />
        <ResultRow
          label={t('calculators.risk.diversificationBenefit')}
          value={formatPct(result.diversificationBenefit)}
          color="var(--success)"
        />
        <ResultRow
          label={t('calculators.risk.stockRiskContribution')}
          value={formatPct(result.riskContributionStock)}
        />
        <ResultRow
          label={t('calculators.risk.bondRiskContribution')}
          value={formatPct(result.riskContributionBond)}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        {t('calculators.risk.formula')}
      </div>
    </>
  );
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
    <CollapsibleCard icon={BarChart3} title={t('calculators.risk.title')}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label={t('calculators.risk.stockPct')}
          value={stockPct}
          onChange={setStockPct}
          suffix="%"
          step={5}
          min={0}
          max={100}
        />
        <Field
          label={t('calculators.risk.bondPct')}
          value={bondPct}
          onChange={setBondPct}
          suffix="%"
          step={5}
          min={0}
          max={100}
        />
        <Field
          label={t('calculators.risk.stockVol')}
          value={stockVol}
          onChange={setStockVol}
          suffix="%"
          step={1}
        />
        <Field
          label={t('calculators.risk.bondVol')}
          value={bondVol}
          onChange={setBondVol}
          suffix="%"
          step={1}
        />
      </div>
      <Field
        label={t('calculators.risk.correlation')}
        value={correlation}
        onChange={setCorrelation}
        step={0.05}
        min={-1}
        max={1}
      />
      <RiskResults result={result} t={t} />
    </CollapsibleCard>
  );
}
