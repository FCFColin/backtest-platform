import type { FactorRegressionResult, FetchRegressionParams } from './types.js';

export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

export function fmtNum(v: number): string {
  return v.toFixed(3);
}

export function generateMockRegression(
  factors: string[],
  returnFrequency: string,
): FactorRegressionResult {
  const seed = factors.join('-').length;
  const pseudoRandom = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    return x - Math.floor(x);
  };

  const numPoints = returnFrequency === 'monthly' ? 180 : 3600;
  const residuals = Array.from({ length: numPoints }, (_, i) => (pseudoRandom(i) - 0.5) * 0.04);

  return {
    alpha: (pseudoRandom(1) - 0.3) * 0.04,
    beta: 0.8 + pseudoRandom(2) * 0.4,
    smb: factors.includes('smb') ? (pseudoRandom(3) - 0.5) * 0.3 : 0,
    hml: factors.includes('hml') ? (pseudoRandom(4) - 0.5) * 0.3 : 0,
    rSquared: 0.6 + pseudoRandom(5) * 0.3,
    residuals,
  };
}

export async function fetchRegression(
  params: FetchRegressionParams,
): Promise<FactorRegressionResult> {
  const { validAssets, startDate, endDate, selectedFactors, returnFrequency, rfSource } = params;
  const res = await fetch('/api/backtest/factor-regression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio: {
        name: '组合',
        assets: validAssets,
        rebalanceFrequency: 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
      parameters: {
        startDate,
        endDate,
        startingValue: 10000,
        baseCurrency: 'usd',
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
        extendedWithdrawalStats: false,
        cashflowLegs: [],
        oneTimeCashflows: [],
      },
      factors: selectedFactors,
      returnFrequency,
      rfSource,
    }),
  });
  if (res.ok) {
    const json = await res.json();
    if (json.success === false) throw new Error(json.error || '因子回归失败');
    const data = json.data ?? json;
    return {
      alpha: data.alpha ?? 0,
      beta: data.beta ?? 0,
      smb: data.smb ?? 0,
      hml: data.hml ?? 0,
      rSquared: data.rSquared ?? 0,
      residuals: data.residuals ?? [],
    };
  }
  return generateMockRegression(selectedFactors, returnFrequency);
}
