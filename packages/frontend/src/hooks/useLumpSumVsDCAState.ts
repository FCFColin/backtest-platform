import type { TFunction } from 'i18next';
import type { Statistics } from '@backtest/shared';
import { useAsyncAction, useAssetList, useSetterState } from './miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../i18n/index.js';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  DEFAULT_60_40_ASSETS,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
export type DcaFrequency = 'monthly' | 'quarterly';
export interface CompareResult {
  label: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar?: number;
  maxDrawdownDuration?: number;
  ulcerIndex?: number;
  finalValue: number;
  growthCurve: Array<{ date: string; value: number }>;
}
function extractStats(
  stats: Statistics,
): Pick<
  CompareResult,
  | 'cagr'
  | 'stdev'
  | 'maxDrawdown'
  | 'sharpe'
  | 'sortino'
  | 'calmar'
  | 'maxDrawdownDuration'
  | 'ulcerIndex'
> {
  return {
    cagr: stats?.cagr ?? 0,
    stdev: stats?.stdev ?? 0,
    maxDrawdown: stats?.maxDrawdown ?? 0,
    sharpe: stats?.sharpe ?? 0,
    sortino: stats?.sortino ?? 0,
    calmar: stats?.calmar,
    maxDrawdownDuration: stats?.maxDrawdownDuration,
    ulcerIndex: stats?.ulcerIndex,
  };
}
interface BacktestPortfolioResponse {
  growthCurve?: Array<{ date: string; value: number }>;
  statistics?: Statistics;
}
function toResult(p: BacktestPortfolioResponse, label: string): CompareResult {
  const curve = p.growthCurve ?? [];
  return {
    label,
    ...extractStats(p.statistics as Statistics),
    finalValue: curve.length > 0 ? curve[curve.length - 1].value : 0,
    growthCurve: curve,
  };
}
async function fetchBacktest(body: unknown) {
  const res = await apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}
function useLumpSumVsDCAStateInner() {
  const s = useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    startingValue: 120000,
    baseCurrency: 'usd' as 'usd' | 'cny',
    adjustForInflation: false,
    dcaFrequency: 'monthly' as DcaFrequency,
    dcaPeriods: 12,
    investTbill: false,
    results: [] as CompareResult[],
  });
  const { isLoading, error, run, setError } = useAsyncAction();
  return { ...s, isLoading, error, run, setError };
}
type LumpSumVsDCAStateInner = ReturnType<typeof useLumpSumVsDCAStateInner>;
type LumpSumAsset = { ticker: string; weight: number };
async function executeComparison(s: LumpSumVsDCAStateInner, validAssets: LumpSumAsset[]) {
  const baseParams = {
    startDate: s.startDate,
    endDate: s.endDate,
    startingValue: s.startingValue,
    baseCurrency: s.baseCurrency,
    adjustForInflation: s.adjustForInflation,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
  const portfolioDef = {
    name: 'portfolio',
    assets: validAssets,
    rebalanceFrequency: 'quarterly' as const,
    rebalanceOffset: 0,
    drag: 0,
    totalReturn: true,
  };
  const lumpSumBody = {
    portfolios: [{ ...portfolioDef, name: 'lumpSum' }],
    parameters: { ...baseParams, startingValue: s.startingValue },
  };
  const contributionAmount = Math.round(s.startingValue / s.dcaPeriods);
  const dcaBody = {
    portfolios: [{ ...portfolioDef, name: 'dca' }],
    parameters: {
      ...baseParams,
      startingValue: 0,
      cashflowLegs: [
        {
          id: `dca-${Date.now()}`,
          amount: contributionAmount,
          type: 'contribution' as const,
          frequency: s.dcaFrequency === 'monthly' ? ('monthly' as const) : ('quarterly' as const),
          offset: 0,
        },
      ],
    },
  };
  const [lumpSumRes, dcaRes] = await Promise.all([
    fetchBacktest(lumpSumBody),
    fetchBacktest(dcaBody),
  ]);
  const lumpSumFailedMsg = i18n.t('Lump sum backtest failed');
  const dcaFailedMsg = i18n.t('DCA backtest failed');
  if (!lumpSumRes.ok) throw new Error(`${lumpSumFailedMsg}: HTTP ${lumpSumRes.status}`);
  if (!dcaRes.ok) throw new Error(`${dcaFailedMsg}: HTTP ${dcaRes.status}`);
  const lumpSumJson = await lumpSumRes.json();
  const dcaJson = await dcaRes.json();
  if (lumpSumJson.success === false) throw new Error(lumpSumJson.error || lumpSumFailedMsg);
  if (dcaJson.success === false) throw new Error(dcaJson.error || dcaFailedMsg);
  const lumpSumP = (lumpSumJson.data ?? lumpSumJson).portfolios?.[0];
  const dcaP = (dcaJson.data ?? dcaJson).portfolios?.[0];
  if (!lumpSumP) throw new Error(i18n.t('Lump sum has no result'));
  if (!dcaP) throw new Error(i18n.t('DCA has no result'));
  s.setResults([toResult(lumpSumP, i18n.t('Lump Sum')), toResult(dcaP, i18n.t('DCA'))]);
}
export function useLumpSumVsDCAState(t: TFunction) {
  const s = useLumpSumVsDCAStateInner();
  const { assets, setAssets, addAsset, removeAsset, updateAsset, totalWeight } =
    useAssetList<LumpSumAsset>([...DEFAULT_60_40_ASSETS], () => ({ ticker: '', weight: 0 }), 0);
  const runComparison = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      s.setError(t('Please add at least one ticker'));
      return;
    }
    const weightErr = validateAssetWeights(assets);
    if (weightErr) {
      s.setError(weightErr);
      return;
    }
    s.setResults([]);
    s.run(() => executeComparison(s, validAssets));
  };
  return {
    ...s,
    assets,
    setAssets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    runComparison,
  };
}
export type LumpSumVsDCAState = ReturnType<typeof useLumpSumVsDCAState>;
