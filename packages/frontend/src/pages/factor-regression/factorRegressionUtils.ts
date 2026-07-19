/**
 * @file 因子回归页面纯函数与常量集合
 * @description 承载类型定义、常量、Fama-French 数据加载、收益序列聚合与回归请求编排
 */
import { CHART_COLORS } from '@backtest/shared';
import { apiFetch } from '../../utils/apiClient.js';
import i18n from '../../i18n/index.js';

// ===== 类型定义 =====

/** Fama-French 因子数据点（运行时从 /data/fama-french-factors.json 动态加载，不进入主 bundle） */
interface FFDataPoint {
  date: string;
  mktRf: number;
  smb: number;
  hml: number;
  rf: number;
}

export type ReturnFrequency = 'monthly' | 'daily';

/** 因子回归结果 */
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

/** 因子回归请求参数 */
interface FetchRegressionParams {
  validAssets: AssetItem[];
  startDate: string;
  endDate: string;
  selectedFactors: string[];
  returnFrequency: ReturnFrequency;
  rfSource: string;
}

// ===== 常量 =====

/** 因子选项 */
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

/** 无风险利率来源 */
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

// ===== Fama-French 数据加载 =====

let ffDataCache: FFDataPoint[] | null = null;

/** 首次调用时拉取 Fama-French 因子数据并缓存，避免静态导入将 1200+ 行数据打入主 bundle */
async function loadFamaFrenchData(): Promise<FFDataPoint[]> {
  if (ffDataCache) return ffDataCache;
  const res = await fetch('/data/fama-french-factors.json');
  if (!res.ok) throw new Error(i18n.t('factorRegression.errLoadFF'));
  ffDataCache = (await res.json()) as FFDataPoint[];
  return ffDataCache;
}

// ===== 收益序列聚合 =====

/** 从分析数据中提取各 ticker 的日收益率和日期序列 */
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
    // growthCurve 有 n 个价格点 → n-1 个日收益率，取后半段 dates
    const dates = gc.slice(1).map((p: { date: string }) => p.date);
    result.push({ ticker: tk.ticker, dailyReturns: dr, dates });
  }
  return result;
}

/** 将各 ticker 日收益率按权重合并为月度收益序列 */
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

// ===== 回归请求编排 =====

/** 执行因子回归：获取价格数据 → 计算组合月收益 → OLS 回归 */
export async function fetchRegression(
  params: FetchRegressionParams,
): Promise<FactorRegressionResult> {
  const { validAssets, startDate, endDate, selectedFactors } = params;
  const errFetchData = i18n.t('factorRegression.errFetchData');
  const errRegCompute = i18n.t('factorRegression.errRegCompute');

  // 获取每个标的的分析数据（含 dailyReturns）
  const tickers = validAssets.map((a) => a.ticker);
  const analysisRes = await apiFetch('/api/backtest/analysis', {
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
