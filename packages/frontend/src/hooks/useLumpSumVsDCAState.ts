import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type { DcaFrequency, CompareResult } from '../components/lumpSumVsDCA/types.js';
import { toResult, fetchBacktest } from '../components/lumpSumVsDCA/utils.js';

function useLumpSumVsDCAStateInner() {
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [startingValue, setStartingValue] = useState(120000);
  const [baseCurrency, setBaseCurrency] = useState<'usd' | 'cny'>('usd');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [dcaFrequency, setDcaFrequency] = useState<DcaFrequency>('monthly');
  const [dcaPeriods, setDcaPeriods] = useState(12);
  const [investTbill, setInvestTbill] = useState(false);
  const [assets, setAssets] = useState([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
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
    assets,
    setAssets,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
  };
}

export function useLumpSumVsDCAState() {
  const s = useLumpSumVsDCAStateInner();

  const addAsset = () => s.setAssets([...s.assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => s.setAssets(s.assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...s.assets];
    next[i] = { ...next[i], [field]: val };
    s.setAssets(next);
  };
  const totalWeight = s.assets.reduce((sum, a) => sum + (a.weight || 0), 0);

  const runComparison = () => {
    const validAssets = s.assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      s.setError('请至少添加一个标的');
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      s.setError('权重合计必须为 100%');
      return;
    }
    s.setResults([]);
    s.run(() => doComparison(validAssets));
  };

  async function doComparison(validAssets: typeof s.assets) {
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
      name: '组合',
      assets: validAssets,
      rebalanceFrequency: 'quarterly' as const,
      rebalanceOffset: 0,
      drag: 0,
      totalReturn: true,
    };
    const lumpSumBody = {
      portfolios: [{ ...portfolioDef, name: '一次性投资' }],
      parameters: { ...baseParams, startingValue: s.startingValue },
    };
    const contributionAmount = Math.round(s.startingValue / s.dcaPeriods);
    const dcaBody = {
      portfolios: [{ ...portfolioDef, name: '定投' }],
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
    if (!lumpSumRes.ok) throw new Error(`一次性投资回测失败: HTTP ${lumpSumRes.status}`);
    if (!dcaRes.ok) throw new Error(`定投回测失败: HTTP ${dcaRes.status}`);
    const lumpSumJson = await lumpSumRes.json();
    const dcaJson = await dcaRes.json();
    if (lumpSumJson.success === false) throw new Error(lumpSumJson.error || '一次性投资回测失败');
    if (dcaJson.success === false) throw new Error(dcaJson.error || '定投回测失败');
    const lumpSumP = (lumpSumJson.data ?? lumpSumJson).portfolios?.[0];
    const dcaP = (dcaJson.data ?? dcaJson).portfolios?.[0];
    if (!lumpSumP) throw new Error('一次性投资无结果');
    if (!dcaP) throw new Error('定投无结果');
    s.setResults([toResult(lumpSumP, '一次性投资'), toResult(dcaP, '定投')]);
  }

  return { ...s, addAsset, removeAsset, updateAsset, totalWeight, runComparison };
}
