import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type { DcaFrequency, CompareResult } from '../components/lumpSumVsDCA/types.js';
import { toResult, fetchBacktest } from '../components/lumpSumVsDCA/utils.js';

export function useLumpSumVsDCAState() {
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

  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => setAssets(assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const runComparison = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError('请至少添加一个标的');
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('权重合计必须为 100%');
      return;
    }
    setResults([]);
    run(() => doComparison(validAssets));
  };

  async function doComparison(validAssets: typeof assets) {
    const baseParams = {
      startDate,
      endDate,
      startingValue,
      baseCurrency,
      adjustForInflation,
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
      parameters: { ...baseParams, startingValue },
    };
    const contributionAmount = Math.round(startingValue / dcaPeriods);
    const dcaCashflowLegs = [
      {
        id: `dca-${Date.now()}`,
        amount: contributionAmount,
        type: 'contribution' as const,
        frequency: dcaFrequency === 'monthly' ? ('monthly' as const) : ('quarterly' as const),
        offset: 0,
      },
    ];
    const dcaBody = {
      portfolios: [{ ...portfolioDef, name: '定投' }],
      parameters: { ...baseParams, startingValue: 0, cashflowLegs: dcaCashflowLegs },
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

    setResults([toResult(lumpSumP, '一次性投资'), toResult(dcaP, '定投')]);
  }

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
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    isLoading,
    error,
    results,
    runComparison,
  };
}
