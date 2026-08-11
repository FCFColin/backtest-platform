import i18n from '@/i18n/index.js';
import type { RebalanceFrequency } from '@backtest/shared';
import { useAssetList, useSetterState } from '../../hooks/miscHooks.js';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  DEFAULT_60_40_ASSETS,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import {
  FREQ_ORDER,
  OFFSETS,
  fetchFreqResult,
  fetchOffsetResult,
  type FreqResult,
} from './rebalancingSensitivityBuilders.js';
export { REBALANCE_OPTIONS } from './rebalancingSensitivityBuilders.js';
export type { FreqResult } from './rebalancingSensitivityBuilders.js';
export const TABS = [
  { key: 'scatter', labelKey: 'rebalancingSensitivity.tab.scatter' },
  { key: 'distributions', labelKey: 'rebalancingSensitivity.tab.distributions' },
  { key: 'offset', labelKey: 'rebalancingSensitivity.tab.offset' },
  { key: 'table', labelKey: 'rebalancingSensitivity.tab.table' },
];
export interface RebalancingState {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  baseCurrency: 'usd' | 'cny';
  setBaseCurrency: (v: 'usd' | 'cny') => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  selectedFreqs: RebalanceFrequency[];
  toggleFreq: (f: RebalanceFrequency) => void;
  absoluteBand: number | '';
  setAbsoluteBand: (v: number | '') => void;
  relativeBand: number | '';
  setRelativeBand: (v: number | '') => void;
  assets: Array<{ ticker: string; weight: number }>;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  isLoading: boolean;
  error: string | null;
  results: FreqResult[];
  activeTab: string;
  setActiveTab: (v: string) => void;
  offsetFreq: RebalanceFrequency;
  setOffsetFreq: (v: RebalanceFrequency) => void;
  offsetResults: Array<{ offset: number; cagr: number }>;
  isLoadingOffset: boolean;
  runSensitivity: () => Promise<void>;
  runOffsetScan: (freq: RebalanceFrequency) => Promise<void>;
}
function useRebalSetters() {
  return useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    adjustForInflation: false,
    baseCurrency: 'usd' as 'usd' | 'cny',
    startingValue: 10000,
    selectedFreqs: ['monthly', 'quarterly', 'annual'] as RebalanceFrequency[],
    absoluteBand: '' as number | '',
    relativeBand: '' as number | '',
    isLoading: false,
    error: null as string | null,
    results: [] as FreqResult[],
    activeTab: 'scatter',
    offsetFreq: 'monthly' as RebalanceFrequency,
    offsetResults: [] as Array<{ offset: number; cagr: number }>,
    isLoadingOffset: false,
  });
}
function createRebalancingRunners(
  s: ReturnType<typeof useRebalSetters>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
  assets: Array<{ ticker: string; weight: number }>,
) {
  const validate = (): Array<{ ticker: string; weight: number }> | string => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return i18n.t('Please add at least one ticker');
    const weightErr = validateAssetWeights(assets);
    if (weightErr) return weightErr;
    if (s.selectedFreqs.length === 0)
      return i18n.t('Please select at least one rebalancing frequency');
    return validAssets;
  };
  const runOffsetScanInner = async (
    freq: RebalanceFrequency,
    validAssets: Array<{ ticker: string; weight: number }>,
  ) => {
    s.setIsLoadingOffset(true);
    s.setOffsetResults([]);
    try {
      s.setOffsetResults(
        await Promise.all(OFFSETS.map((o) => fetchOffsetResult(o, freq, validAssets, params))),
      );
    } catch {
      s.setError(i18n.t('Rebalancing sensitivity analysis failed'));
    } finally {
      s.setIsLoadingOffset(false);
    }
  };
  const runSensitivity = async () => {
    const validAssets = validate();
    if (typeof validAssets === 'string') {
      s.setError(validAssets);
      return;
    }
    s.setIsLoading(true);
    s.setError(null);
    s.setResults([]);
    s.setOffsetResults([]);
    try {
      const all = await Promise.all(
        s.selectedFreqs.map((f) =>
          fetchFreqResult(f, validAssets, params, s.absoluteBand, s.relativeBand),
        ),
      );
      all.sort((a, b) => FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency]);
      s.setResults(all);
      if (s.selectedFreqs.length > 0) void runOffsetScanInner(s.selectedFreqs[0], validAssets);
    } catch (e) {
      s.setError(e instanceof Error ? e.message : i18n.t('Analysis failed'));
    } finally {
      s.setIsLoading(false);
    }
  };
  const runOffsetScan = async (freq: RebalanceFrequency) => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return;
    await runOffsetScanInner(freq, validAssets);
  };
  return { runSensitivity, runOffsetScan };
}
export function useRebalancingState(): RebalancingState {
  const s = useRebalSetters();
  const toggleFreq = (freq: RebalanceFrequency) =>
    s.setSelectedFreqs(
      s.selectedFreqs.includes(freq)
        ? s.selectedFreqs.filter((f) => f !== freq)
        : [...s.selectedFreqs, freq],
    );
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<{
    ticker: string;
    weight: number;
  }>([...DEFAULT_60_40_ASSETS], () => ({ ticker: '', weight: 0 }), 0);
  const params = {
    startDate: s.startDate,
    endDate: s.endDate,
    startingValue: s.startingValue,
    baseCurrency: s.baseCurrency,
    adjustForInflation: s.adjustForInflation,
  };
  const { runSensitivity, runOffsetScan } = createRebalancingRunners(s, params, assets);
  return {
    ...s,
    toggleFreq,
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    runSensitivity,
    runOffsetScan,
  };
}
