import { useState, useMemo } from 'react';
import { ShieldAlert, BarChart3 } from 'lucide-react';
import { formatPct } from './baseCalculatorUtils.js';
import { Field, ResultRow, CollapsibleCard, InfoBox, SWRChart } from './BaseCalculatorUI.js';

export function SWRCalculator() {
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
    <CollapsibleCard icon={ShieldAlert} title="安全提款率估算 (SWR)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label="组合预期收益"
          value={expectedReturn}
          onChange={setExpectedReturn}
          suffix="%"
          step={0.5}
        />
        <Field label="波动率" value={volatility} onChange={setVolatility} suffix="%" step={1} />
        <Field
          label="退休年限"
          value={retirementYears}
          onChange={setRetirementYears}
          suffix="年"
          step={1}
          min={1}
        />
        <Field
          label="成功率目标"
          value={successTarget}
          onChange={setSuccessTarget}
          suffix="%"
          step={1}
          min={50}
          max={99}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="估算 SWR" value={formatPct(swr)} color="var(--brand)" />
        <ResultRow
          label="年度提款额 (每100万)"
          value={(swr * 1000000).toFixed(0)}
          color="var(--success)"
        />
      </div>
      <SWRChart data={portfolioSurvival} />
      <InfoBox>
        基于简化公式: SWR ≈ μ - σ²/2 -
        z·σ/√T，其中z为对应成功率目标的标准正态分位数。仅供参考，实际SWR应基于历史模拟。
      </InfoBox>
    </CollapsibleCard>
  );
}

export function AssetAllocationRiskCalculator() {
  const [stockPct, setStockPct] = useState(60);
  const [bondPct, setBondPct] = useState(40);
  const [stockVol, setStockVol] = useState(18);
  const [bondVol, setBondVol] = useState(5);
  const [correlation, setCorrelation] = useState(0.2);

  const result = useMemo(() => {
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
  }, [stockPct, bondPct, stockVol, bondVol, correlation]);

  return (
    <CollapsibleCard icon={BarChart3} title="资产配置风险估算">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label="股票占比"
          value={stockPct}
          onChange={setStockPct}
          suffix="%"
          step={5}
          min={0}
          max={100}
        />
        <Field
          label="债券占比"
          value={bondPct}
          onChange={setBondPct}
          suffix="%"
          step={5}
          min={0}
          max={100}
        />
        <Field label="股票波动率" value={stockVol} onChange={setStockVol} suffix="%" step={1} />
        <Field label="债券波动率" value={bondVol} onChange={setBondVol} suffix="%" step={1} />
      </div>
      <Field
        label="相关性"
        value={correlation}
        onChange={setCorrelation}
        step={0.05}
        min={-1}
        max={1}
      />
      <div style={{ marginTop: 8 }}>
        <ResultRow label="组合波动率" value={formatPct(result.portfolioVol)} color="var(--brand)" />
        <ResultRow
          label="分散化收益"
          value={formatPct(result.diversificationBenefit)}
          color="var(--success)"
        />
        <ResultRow label="股票风险贡献" value={formatPct(result.riskContributionStock)} />
        <ResultRow label="债券风险贡献" value={formatPct(result.riskContributionBond)} />
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
        组合波动率 = √(w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂)。分散化收益 = 加权波动率之和 - 组合波动率。
      </div>
    </CollapsibleCard>
  );
}
