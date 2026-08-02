import { CHART_COLORS } from '@backtest/shared';
import { apiFetch } from '../../utils/apiClient.js';
import i18n from '../../i18n/index.js';
interface FFDataPoint {
  date: string;
  mktRf: number;
  smb: number;
  hml: number;
  rf: number;
}
export type ReturnFrequency = 'monthly' | 'daily';
export interface FactorRegressionResult {
  alpha: number;
  beta: number;
  smb: number;
  hml: number;
  rSquared: number;
  residuals: number[];
}
export interface AssetItem {
  ticker: string;
  weight: number;
}
interface FetchRegressionParams {
  validAssets: AssetItem[];
  startDate: string;
  endDate: string;
  selectedFactors: string[];
  returnFrequency: ReturnFrequency;
  rfSource: string;
}
export const FACTOR_OPTIONS = [
  {
    key: 'mktRF',
    label: 'factorRegression.factors.mktRf',
    desc: 'factorRegression.factors.mktRfDesc',
  },
  {
    key: 'smb',
    label: 'factorRegression.factors.smb',
    desc: 'factorRegression.factors.smbDesc',
  },
  {
    key: 'hml',
    label: 'factorRegression.factors.hml',
    desc: 'factorRegression.factors.hmlDesc',
  },
];
export const RF_SOURCE_OPTIONS = [
  { value: 'us-3m', label: 'factorRegression.rfSources.us3m' },
  { value: 'us-1y', label: 'factorRegression.rfSources.us1y' },
];
export const FACTOR_COLORS = {
  alpha: CHART_COLORS[0],
  beta: CHART_COLORS[1],
  smb: CHART_COLORS[2],
  hml: CHART_COLORS[3],
} as const;
let ffDataCache: FFDataPoint[] | null = null;
async function loadFamaFrenchData(): Promise<FFDataPoint[]> {
  if (ffDataCache) return ffDataCache;
  const res = await apiFetch('/api/v1/data/factors');
  if (!res.success) throw new Error(i18n.t('factorRegression.errLoadFF'));
  ffDataCache = (res.data as FFDataPoint[]).map((r) => ({
    date: r.date as string,
    mktRf: Number(r.mktRf ?? r.mkt_rf) || 0,
    smb: Number(r.smb) || 0,
    hml: Number(r.hml) || 0,
    rf: Number(r.rf) || 0,
  }));
  return ffDataCache;
}
function extractTickerReturns(
  tickersData: Array<{
    ticker: string;
    growthCurve?: Array<{ date: string }>;
    dailyReturns?: number[];
  }>,
): Array<{ ticker: string; dailyReturns: number[]; dates: string[] }> {
  const result: Array<{ ticker: string; dailyReturns: number[]; dates: string[] }> = [];
  for (const tk of tickersData) {
    const gc = tk.growthCurve ?? [];
    const dr = tk.dailyReturns ?? [];
    if (gc.length < 2 || dr.length < 1) continue;
    const dates = gc.slice(1).map((p: { date: string }) => p.date);
    result.push({ ticker: tk.ticker, dailyReturns: dr, dates });
  }
  return result;
}
function computeCombinedMonthlyReturns(
  tickerReturns: Array<{ ticker: string; dailyReturns: number[]; dates: string[] }>,
  weightMap: Map<string, number>,
): Array<{ date: string; value: number }> {
  const longest = tickerReturns.reduce((a, b) =>
    a.dailyReturns.length > b.dailyReturns.length ? a : b,
  );
  const combinedMonthlyReturns = new Map<string, number>();
  for (let i = 0; i < longest.dailyReturns.length; i++) {
    const date = longest.dates[i];
    if (!date) continue;
    const monthKey = date.slice(0, 7);
    let dailyReturn = 0;
    for (const tr of tickerReturns) {
      const idx = tr.dates.indexOf(date);
      if (idx >= 0) dailyReturn += tr.dailyReturns[idx] * (weightMap.get(tr.ticker) ?? 0);
    }
    const prev = combinedMonthlyReturns.get(monthKey) ?? 1;
    combinedMonthlyReturns.set(monthKey, prev * (1 + dailyReturn));
  }
  return Array.from(combinedMonthlyReturns.entries())
    .map(([date, value]) => ({ date, value: value - 1 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export async function fetchRegression(
  params: FetchRegressionParams,
): Promise<FactorRegressionResult> {
  const { validAssets, startDate, endDate, selectedFactors } = params;
  const errFetchData = i18n.t('factorRegression.errFetchData');
  const errRegCompute = i18n.t('factorRegression.errRegCompute');
  const tickers = validAssets.map((a) => a.ticker);
  const analysisRes = await apiFetch('/api/v1/backtest/analysis', {
    method: 'POST',
    body: JSON.stringify({
      tickers,
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
    }),
  });
  if (!analysisRes.ok) throw new Error(errFetchData);
  const analysisJson = await analysisRes.json();
  if (analysisJson.success === false) throw new Error(analysisJson.error || errFetchData);
  const analysisData = analysisJson.data ?? analysisJson;
  const tickerReturns = extractTickerReturns(analysisData.tickers ?? []);
  if (tickerReturns.length === 0) throw new Error(i18n.t('factorRegression.errNoPriceData'));
  const totalW = validAssets.reduce((s, a) => s + (a.weight || 0), 0);
  const weightMap = new Map(validAssets.map((a) => [a.ticker, (a.weight || 0) / totalW]));
  const monthlyReturns = computeCombinedMonthlyReturns(tickerReturns, weightMap);
  if (monthlyReturns.length < 3) throw new Error(i18n.t('factorRegression.errInsufficientData'));
  const ffData = await loadFamaFrenchData();
  const regRes = await apiFetch('/api/v1/analysis/factor-regression', {
    method: 'POST',
    body: JSON.stringify({
      monthlyReturns,
      ffData,
      factors: selectedFactors,
      startDate,
      endDate,
    }),
  });
  if (!regRes.ok) throw new Error(errRegCompute);
  const regJson = await regRes.json();
  if (regJson.success === false) throw new Error(regJson.error?.detail || errRegCompute);
  return regJson.data as FactorRegressionResult;
}
