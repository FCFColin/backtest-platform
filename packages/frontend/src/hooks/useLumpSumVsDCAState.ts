/**
 * @file 一次性投入 vs 定投对比页面状态管理 hook
 * @description 承载 LumpSumVsDCAPage 的全部 state、参数校验与对比执行逻辑
 */
import { useState } from 'react';
import type { TFunction } from 'i18next';
import type { Statistics } from '@backtest/shared';
import { useAsyncAction } from './useAsyncAction.js';
import { useListState } from './useListState.js';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../i18n/index.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResult(p: any, label: string): CompareResult {
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
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [startingValue, setStartingValue] = useState(120000);
  const [baseCurrency, setBaseCurrency] = useState<'usd' | 'cny'>('usd');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [dcaFrequency, setDcaFrequency] = useState<DcaFrequency>('monthly');
  const [dcaPeriods, setDcaPeriods] = useState(12);
  const [investTbill, setInvestTbill] = useState(false);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<CompareResult[]>([]);
  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    baseCurrency,
    setBaseCurrency,
    adjustForInflation,
    setAdjustForInflation,
    dcaFrequency,
    setDcaFrequency,
    dcaPeriods,
    setDcaPeriods,
    investTbill,
    setInvestTbill,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
  };
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
  const lumpSumFailedMsg = i18n.t('lumpSumDca.errLumpSumFailed');
  const dcaFailedMsg = i18n.t('lumpSumDca.errDcaFailed');
  if (!lumpSumRes.ok) throw new Error(`${lumpSumFailedMsg}: HTTP ${lumpSumRes.status}`);
  if (!dcaRes.ok) throw new Error(`${dcaFailedMsg}: HTTP ${dcaRes.status}`);
  const lumpSumJson = await lumpSumRes.json();
  const dcaJson = await dcaRes.json();
  if (lumpSumJson.success === false) throw new Error(lumpSumJson.error || lumpSumFailedMsg);
  if (dcaJson.success === false) throw new Error(dcaJson.error || dcaFailedMsg);
  const lumpSumP = (lumpSumJson.data ?? lumpSumJson).portfolios?.[0];
  const dcaP = (dcaJson.data ?? dcaJson).portfolios?.[0];
  if (!lumpSumP) throw new Error(i18n.t('lumpSumDca.errLumpSumNoResult'));
  if (!dcaP) throw new Error(i18n.t('lumpSumDca.errDcaNoResult'));
  s.setResults([
    toResult(lumpSumP, i18n.t('lumpSumDca.lumpSumLabel')),
    toResult(dcaP, i18n.t('lumpSumDca.dcaLabel')),
  ]);
}

/**
 * LumpSumVsDCAPage 顶层状态 hook：组合基础 state、标的编辑、权重校验与对比执行。
 * @param t - i18n 翻译函数，用于构造校验错误消息
 */
export function useLumpSumVsDCAState(t: TFunction) {
  const s = useLumpSumVsDCAStateInner();
  const {
    items: assets,
    setItems: setAssets,
    addItem: addAsset,
    removeItem: removeAsset,
    updateItem,
  } = useListState<LumpSumAsset>(
    [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    () => ({ ticker: '', weight: 0 }),
    0,
  );
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) =>
    updateItem(i, (prev) => ({ ...prev, [field]: val }));
  const totalWeight = assets.reduce((sum, a) => sum + (a.weight || 0), 0);

  const runComparison = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      s.setError(t('lumpSumDca.errEmptyAssets'));
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      s.setError(t('lumpSumDca.errWeightSum'));
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
