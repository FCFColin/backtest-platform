import { useState, type Dispatch, type SetStateAction } from 'react';
import type { MonteCarloResult } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import i18n from '@/i18n/index.js';
import { validatePortfolioCore } from '@/utils/validation';
import type {
  PortfolioState,
  PortfolioMode,
  SimMode,
  DistMetric,
  ResultTab,
} from './monteCarloTypes.js';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  BASE_BACKTEST_PARAMS,
} from '@/utils/constants';

function createDefaultPortfolio(suffix: number): PortfolioState {
  return {
    name: `组合 ${suffix}`,
    assets:
      suffix === 1
        ? [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ]
        : [
            { ticker: 'VXUS', weight: 50 },
            { ticker: 'BND', weight: 50 },
          ],
    rebalanceFrequency: 'yearly',
  };
}

function usePortfolioOperations(
  portfolios: PortfolioState[],
  setPortfolios: Dispatch<SetStateAction<PortfolioState[]>>,
) {
  const updatePortfolio = (idx: number, patch: Partial<PortfolioState>) =>
    setPortfolios((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  const addAsset = (pIdx: number) =>
    updatePortfolio(pIdx, { assets: [...portfolios[pIdx].assets, { ticker: '', weight: 0 }] });
  const removeAsset = (pIdx: number, aIdx: number) =>
    updatePortfolio(pIdx, { assets: portfolios[pIdx].assets.filter((_, i) => i !== aIdx) });
  const updateAsset = (
    pIdx: number,
    aIdx: number,
    field: 'ticker' | 'weight',
    val: string | number,
  ) => {
    const next = [...portfolios[pIdx].assets];
    next[aIdx] = { ...next[aIdx], [field]: val };
    updatePortfolio(pIdx, { assets: next });
  };
  const getTotalWeight = (pIdx: number) =>
    portfolios[pIdx].assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isComplete = (pIdx: number) => getTotalWeight(pIdx) === 100;
  return { updatePortfolio, addAsset, removeAsset, updateAsset, getTotalWeight, isComplete };
}

function validatePortfolios(
  portfolios: PortfolioState[],
  portfolioMode: PortfolioMode,
  isComplete: (pIdx: number) => boolean,
): string | null {
  return validatePortfolioCore(portfolios, {
    limit: portfolioMode,
    emptyTickerMode: 'lenient',
    isWeightComplete: isComplete,
    onError: (idx, key) =>
      key === 'emptyTicker'
        ? i18n.t('monteCarlo.emptyTickerWarning', { index: idx + 1 })
        : i18n.t('monteCarlo.weightSumWarning', { index: idx + 1 }),
  });
}

async function fetchMcResult(
  idx: number,
  portfolios: PortfolioState[],
  reqBody: { parameters: object; mcParams: object; objectives: object },
): Promise<MonteCarloResult> {
  const p = portfolios[idx];
  const res = await apiFetch('/api/v1/backtest/monte-carlo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio: {
        name: p.name,
        assets: p.assets.filter((a) => a.ticker.trim()),
        rebalanceFrequency: p.rebalanceFrequency,
      },
      ...reqBody,
    }),
  });
  if (!res.ok) throw new Error(`组合 ${idx + 1}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || `组合 ${idx + 1} 模拟失败`);
  return json.data ?? json;
}

interface SimExecParams {
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  isComplete: (pIdx: number) => boolean;
  numYears: number;
  numSimulations: number;
  minBlock: number;
  maxBlock: number;
  withReplacement: boolean;
  randomSeed: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  simMode: SimMode;
  goal1: string;
  goal2: string;
  goalWeight: number;
}

async function executeSimulation(
  params: SimExecParams,
  setters: {
    setError: (e: string | null) => void;
    setIsLoading: (b: boolean) => void;
    setResults1: (r: MonteCarloResult | null) => void;
    setResults2: (r: MonteCarloResult | null) => void;
  },
): Promise<void> {
  const validationError = validatePortfolios(
    params.portfolios,
    params.portfolioMode,
    params.isComplete,
  );
  if (validationError) {
    setters.setError(validationError);
    return;
  }
  setters.setIsLoading(true);
  setters.setError(null);
  setters.setResults1(null);
  setters.setResults2(null);
  const mcParams = {
    numYears: params.numYears,
    numSimulations: params.numSimulations,
    minBlockYears: params.minBlock,
    maxBlockYears: params.maxBlock,
    withReplacement: params.withReplacement,
    seed: params.randomSeed ? Number(params.randomSeed) : undefined,
  };
  const parameters = {
    ...BASE_BACKTEST_PARAMS,
    startDate: params.startDate,
    endDate: params.endDate,
    startingValue: params.startingValue,
    adjustForInflation: false,
    baseCurrency: 'usd' as const,
  };
  const objectives = {
    mode: params.simMode,
    goal1: params.goal1,
    goal2: params.goal2,
    goal1Weight: params.goalWeight / 100,
    goal2Weight: (100 - params.goalWeight) / 100,
  };
  try {
    const reqBody = { parameters, mcParams, objectives };
    const promises = [fetchMcResult(0, params.portfolios, reqBody)];
    if (params.portfolioMode === 2) promises.push(fetchMcResult(1, params.portfolios, reqBody));
    const results = await Promise.all(promises);
    setters.setResults1(results[0]);
    if (results[1]) setters.setResults2(results[1]);
  } catch (e) {
    setters.setError(e instanceof Error ? e.message : '模拟失败');
  } finally {
    setters.setIsLoading(false);
  }
}

function useMcSetters() {
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>(1);
  const [numYears, setNumYears] = useState(20);
  const [numSimulations, setNumSimulations] = useState(500);
  const [startingValue, setStartingValue] = useState(100000);
  const [minBlock, setMinBlock] = useState(1);
  const [maxBlock, setMaxBlock] = useState(5);
  const [withReplacement, setWithReplacement] = useState(true);
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [randomSeed, setRandomSeed] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results1, setResults1] = useState<MonteCarloResult | null>(null);
  const [results2, setResults2] = useState<MonteCarloResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');
  const [distMetric, setDistMetric] = useState<DistMetric>('finalValue');
  const [portfolios, setPortfolios] = useState<PortfolioState[]>([
    createDefaultPortfolio(1),
    createDefaultPortfolio(2),
  ]);
  const [simMode, setSimMode] = useState<SimMode>('standard');
  const [goal1, setGoal1] = useState('maxCagrPercentile');
  const [goal2, setGoal2] = useState('minMaxDrawdown');
  const [goalWeight, setGoalWeight] = useState(50);
  return {
    portfolioMode,
    setPortfolioMode,
    numYears,
    setNumYears,
    numSimulations,
    setNumSimulations,
    startingValue,
    setStartingValue,
    minBlock,
    setMinBlock,
    maxBlock,
    setMaxBlock,
    withReplacement,
    setWithReplacement,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    randomSeed,
    setRandomSeed,
    isLoading,
    setIsLoading,
    error,
    setError,
    results1,
    setResults1,
    results2,
    setResults2,
    activeTab,
    setActiveTab,
    distMetric,
    setDistMetric,
    portfolios,
    setPortfolios,
    simMode,
    setSimMode,
    goal1,
    setGoal1,
    goal2,
    setGoal2,
    goalWeight,
    setGoalWeight,
  };
}

export function useMonteCarloState() {
  const s = useMcSetters();
  const portfolioOps = usePortfolioOperations(s.portfolios, s.setPortfolios);
  const runSimulation = () =>
    executeSimulation(
      {
        portfolios: s.portfolios,
        portfolioMode: s.portfolioMode,
        ...portfolioOps,
        numYears: s.numYears,
        numSimulations: s.numSimulations,
        minBlock: s.minBlock,
        maxBlock: s.maxBlock,
        withReplacement: s.withReplacement,
        randomSeed: s.randomSeed,
        startDate: s.startDate,
        endDate: s.endDate,
        startingValue: s.startingValue,
        simMode: s.simMode,
        goal1: s.goal1,
        goal2: s.goal2,
        goalWeight: s.goalWeight,
      },
      {
        setError: s.setError,
        setIsLoading: s.setIsLoading,
        setResults1: s.setResults1,
        setResults2: s.setResults2,
      },
    );
  // 内部 setter（setIsLoading/setError/setResults1/setResults2）随 spread 暴露到运行时
  // 但不在 McState 类型中，TypeScript 结构类型允许返回对象包含额外字段，
  // 消费者无法经由类型系统访问这些内部字段。
  return {
    ...s,
    ...portfolioOps,
    runSimulation,
  };
}

export type McState = ReturnType<typeof useMonteCarloState>;
