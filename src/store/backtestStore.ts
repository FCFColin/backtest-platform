import { create } from 'zustand';
import { startTransition } from 'react';
import i18n from '../i18n/index.js';
import type {
  Portfolio,
  Asset,
  BacktestParameters,
  BacktestResult,
  PortfolioResult,
  CashflowLeg,
  OneTimeCashflow,
  Statistics,
} from '../../shared/types';
import { useToastStore } from './toastStore';

interface BacktestState {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  results: BacktestResult | null;
  isLoading: boolean;
  activeTab: string;
  portfolioCounter: number;
  hasLoadedFromShare: boolean;
  _abortController: AbortController | null;

  addPortfolio: () => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  duplicatePortfolio: (id: string) => void;
  removePortfolio: (id: string) => void;
  addAsset: (portfolioId: string) => void;
  removeAsset: (portfolioId: string, ticker: string) => void;
  updateAsset: (portfolioId: string, assetIndex: number, updates: Partial<Asset>) => void;
  batchUpdateAssets: (
    portfolioId: string,
    updates: Array<{ index: number; weight: number }>,
  ) => void;
  updatePortfolio: (
    id: string,
    updates: Partial<
      Pick<
        Portfolio,
        | 'name'
        | 'rebalanceFrequency'
        | 'rebalanceThreshold'
        | 'rebalanceOffset'
        | 'rebalanceBands'
        | 'drag'
        | 'totalReturn'
        | 'isGlidepath'
        | 'glidepathFrom'
        | 'glidepathTo'
        | 'glidepathYears'
        | 'glidepathToWeights'
      >
    >,
  ) => void;
  updateParameter: <K extends keyof BacktestParameters>(
    key: K,
    value: BacktestParameters[K],
  ) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  setResults: (results: BacktestResult | null) => void;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
  runBacktest: () => Promise<void>;
  enrichSeries: (series: BacktestSeriesField[]) => Promise<void>;
}

export type BacktestSeriesField = 'rollingReturns' | 'allocationHistory' | 'drawdownEpisodes';

type SetFn = (
  partial: Partial<BacktestState> | ((state: BacktestState) => Partial<BacktestState>),
) => void;
type GetFn = () => BacktestState;

let currentRequestId = 0;

/** 从 RFC 7807 / 旧版 envelope 响应中提取可读错误信息 */
export function extractApiErrorDetail(json: unknown): string {
  if (!json || typeof json !== 'object') return i18n.t('backtest.runFailed');
  const body = json as Record<string, unknown>;
  if (typeof body.detail === 'string') return body.detail;
  const err = body.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.detail === 'string') return e.detail;
  }
  return i18n.t('backtest.runFailed');
}

/** 补齐引擎/压缩响应中可能缺失的序列字段，避免图表组件 .map 崩溃 */
export function normalizeBacktestResult(raw: unknown): BacktestResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as BacktestResult;
  const emptyStats = {} as Statistics;
  return {
    ...data,
    portfolios: (Array.isArray(data.portfolios) ? data.portfolios : []).map((p) => ({
      ...p,
      growthCurve: p.growthCurve ?? [],
      drawdownCurve: p.drawdownCurve ?? [],
      annualReturns: p.annualReturns ?? [],
      monthlyReturns: p.monthlyReturns ?? [],
      rollingReturns: p.rollingReturns ?? [],
      allocationHistory: p.allocationHistory ?? [],
      drawdownEpisodes: p.drawdownEpisodes ?? [],
      statistics: p.statistics ?? emptyStats,
    })),
    correlations: data.correlations ?? [],
    assetTickers: data.assetTickers ?? [],
    assetCorrelations: data.assetCorrelations ?? [],
    benchmarkGrowth: data.benchmarkGrowth ?? [],
  };
}

/** 与 POST /api/backtest/portfolio 请求体对齐 */
function buildBacktestRequestBody(portfolios: Portfolio[], parameters: BacktestParameters) {
  return {
    portfolios: portfolios.map((p) => ({
      name: p.name,
      assets: p.assets,
      rebalanceFrequency: p.rebalanceFrequency,
      rebalanceThreshold: p.rebalanceThreshold,
      rebalanceOffset: p.rebalanceOffset,
      rebalanceBands: p.rebalanceBands,
      drag: p.drag,
      totalReturn: p.totalReturn,
      isGlidepath: p.isGlidepath,
      glidepathToWeights: p.glidepathToWeights,
      glidepathYears: p.glidepathYears,
    })),
    parameters,
  };
}

const defaultParameters: BacktestParameters = {
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  baseCurrency: 'usd',
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
  extendedWithdrawalStats: false,
  cashflowLegs: [],
  oneTimeCashflows: [],
};

const createDefaultPortfolio = (counter: number): Portfolio => {
  return {
    id: `portfolio-${Date.now()}-${counter}`,
    name: `Portfolio ${counter}`,
    assets: [
      { id: `asset-${Date.now()}-1`, ticker: 'VTI', weight: 60 },
      { id: `asset-${Date.now()}-2`, ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
    rebalanceOffset: 0,
    drag: 0,
    totalReturn: true,
  };
};

/** 前端快速验证：检查空 ticker 和权重总和，返回错误消息或 null */
function validatePortfolios(portfolios: Portfolio[]): string | null {
  const allAssets = portfolios.flatMap((p) => p.assets);
  if (allAssets.some((a) => !a.ticker.trim())) {
    return i18n.t('backtest.emptyTickerWarning');
  }
  for (const p of portfolios) {
    const tw = p.assets.reduce((s, a) => s + a.weight, 0);
    if (Math.abs(tw - 100) > 0.01) {
      return i18n.t('backtest.weightSumWarning', { name: p.name, total: tw.toFixed(2) });
    }
  }
  return null;
}

/** 根据 error 类型显示对应的 toast 消息 */
function handleBacktestError(error: unknown): void {
  console.error('Backtest failed:', error);
  if (error instanceof DOMException && error.name === 'AbortError') {
    useToastStore.getState().addToast('error', i18n.t('backtest.timeout'));
  } else if (error instanceof TypeError) {
    useToastStore.getState().addToast('error', i18n.t('backtest.networkError'));
  } else if (error instanceof Error && error.message) {
    useToastStore.getState().addToast('error', error.message);
  } else {
    useToastStore.getState().addToast('error', i18n.t('backtest.runFailed'));
  }
}

/** 处理成功响应中的警告和降级提示 */
function processResponseWarnings(json: Record<string, unknown>): void {
  const warnings = json.warnings as string[] | undefined;
  if (warnings && warnings.length > 0) {
    for (const w of warnings) useToastStore.getState().addToast('warning', w);
  }
  if (json.degraded && json.degradedWarning) {
    useToastStore.getState().addToast('warning', json.degradedWarning as string);
  }
}

async function runBacktestAction(set: SetFn, get: GetFn): Promise<void> {
  const requestId = ++currentRequestId;
  const prevController = get()._abortController;
  if (prevController) prevController.abort();
  const controller = new AbortController();
  set({ _abortController: controller, isLoading: true });

  const { portfolios, parameters } = get();

  const validationError = validatePortfolios(portfolios);
  if (validationError) {
    useToastStore.getState().addToast('warning', validationError);
    if (requestId === currentRequestId) set({ isLoading: false, _abortController: null });
    return;
  }

  try {
    const timeoutId = setTimeout(() => controller.abort(), 180_000);
    const response = await fetch('/api/backtest/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(buildBacktestRequestBody(portfolios, parameters)),
    });
    clearTimeout(timeoutId);

    const json = await response.json();
    if (!response.ok) throw new Error(extractApiErrorDetail(json));

    if (json.success === false) {
      useToastStore.getState().addToast('error', extractApiErrorDetail(json));
      set({ results: null });
      return;
    }

    const results = normalizeBacktestResult(json.data ?? json);
    processResponseWarnings(json);

    if (requestId === currentRequestId) {
      set({ isLoading: false });
      startTransition(() => {
        set({ results, activeTab: 'summary' });
      });
    }
  } catch (error) {
    if (requestId !== currentRequestId) return;
    handleBacktestError(error);
    set({ results: null });
  } finally {
    if (requestId === currentRequestId) set({ isLoading: false, _abortController: null });
  }
}

async function enrichSeriesAction(
  set: SetFn,
  get: GetFn,
  series: BacktestSeriesField[],
): Promise<void> {
  const { portfolios, parameters, results } = get();
  if (!results?.portfolios?.length) return;

  const missing = series.filter((field) =>
    results.portfolios.some((p) => {
      const value = p[field];
      return value === undefined || (Array.isArray(value) && value.length === 0);
    }),
  );
  if (missing.length === 0) return;

  try {
    const response = await fetch('/api/backtest/portfolio/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildBacktestRequestBody(portfolios, parameters),
        series: missing,
      }),
    });
    const json = await response.json();
    if (!response.ok || json.success === false) return;

    const patches = (json.data?.portfolios ?? []) as PortfolioResult[];
    const byName = new Map(patches.map((p) => [p.name, p]));

    startTransition(() => {
      const current = get().results;
      if (!current?.portfolios?.length) return;
      set({
        results: normalizeBacktestResult({
          ...current,
          portfolios: current.portfolios.map((p) => {
            const patch = byName.get(p.name);
            return patch ? { ...p, ...patch } : p;
          }),
        }),
      });
    });
  } catch (error) {
    console.error('Failed to enrich backtest series:', error);
  }
}

interface AddGlidepathOpts {
  set: SetFn;
  get: GetFn;
  name: string;
  fromId: string;
  toId: string;
  years: number;
}

function addGlidepathAction(opts: AddGlidepathOpts): void {
  const { set, get, name, fromId, toId, years } = opts;
  const next = get().portfolioCounter + 1;
  set((state) => {
    const from = state.portfolios.find((p) => p.id === fromId);
    const to = state.portfolios.find((p) => p.id === toId);
    if (!from || !to) return state;
    const toWeights: number[] = from.assets.map((fromAsset) => {
      const toAsset = to.assets.find((a) => a.ticker === fromAsset.ticker);
      return toAsset ? toAsset.weight / 100 : 0;
    });
    const gp: Portfolio = {
      id: `glidepath-${Date.now()}-${next}`,
      name,
      assets: from.assets.map((a) => ({ ...a })),
      rebalanceFrequency: from.rebalanceFrequency,
      rebalanceOffset: from.rebalanceOffset,
      drag: from.drag ?? 0,
      totalReturn: from.totalReturn ?? true,
      isGlidepath: true,
      glidepathFrom: fromId,
      glidepathTo: toId,
      glidepathYears: years,
      glidepathToWeights: toWeights,
    };
    return { portfolioCounter: next, portfolios: [...state.portfolios, gp] };
  });
}

function duplicatePortfolioAction(set: SetFn, get: GetFn, id: string): void {
  const next = get().portfolioCounter + 1;
  set((state) => {
    const source = state.portfolios.find((p) => p.id === id);
    if (!source) return state;
    const copy: Portfolio = {
      ...source,
      id: `portfolio-${Date.now()}-${next}`,
      name: `${source.name} (副本)`,
      assets: source.assets.map((a) => ({ ...a })),
    };
    return { portfolioCounter: next, portfolios: [...state.portfolios, copy] };
  });
}

function loadFromShareAction(
  set: SetFn,
  get: GetFn,
  data: { portfolios: Portfolio[]; parameters: BacktestParameters },
): void {
  const maxId = data.portfolios.reduce((max, p) => {
    const match = p.id?.match(/-(\d+)$/);
    return match ? Math.max(max, parseInt(match[1])) : max;
  }, get().portfolioCounter);
  set({
    portfolios: data.portfolios.map((p) => ({
      ...p,
      id: p.id || `portfolio-${Date.now()}-${maxId + 1}`,
    })),
    parameters: { ...defaultParameters, ...data.parameters },
    results: null,
    activeTab: 'growth' as const,
    portfolioCounter: maxId,
    hasLoadedFromShare: true,
  });
}

function addPortfolioAction(set: SetFn, get: GetFn): void {
  const next = get().portfolioCounter + 1;
  set((state) => ({
    portfolioCounter: next,
    portfolios: [...state.portfolios, createDefaultPortfolio(next)],
  }));
}

function removePortfolioAction(set: SetFn, id: string): void {
  set((state) => {
    if (state.portfolios.length <= 1) return state;
    return { portfolios: state.portfolios.filter((p) => p.id !== id) };
  });
}

function addAssetAction(set: SetFn, portfolioId: string): void {
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId
        ? {
            ...p,
            assets: [
              ...p.assets,
              {
                id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ticker: '',
                weight: 0,
              },
            ],
          }
        : p,
    ),
  }));
}

function removeAssetAction(set: SetFn, portfolioId: string, ticker: string): void {
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, assets: p.assets.filter((a) => a.ticker !== ticker) } : p,
    ),
  }));
}

function updateAssetAction(
  set: SetFn,
  portfolioId: string,
  assetIndex: number,
  updates: Partial<Asset>,
): void {
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId
        ? { ...p, assets: p.assets.map((a, i) => (i === assetIndex ? { ...a, ...updates } : a)) }
        : p,
    ),
  }));
}

function batchUpdateAssetsAction(
  set: SetFn,
  portfolioId: string,
  updates: Array<{ index: number; weight: number }>,
): void {
  const applyBatchUpdates = (assets: Portfolio['assets']) =>
    assets.map((a, i) => {
      const u = updates.find((u) => u.index === i);
      return u ? { ...a, weight: u.weight } : a;
    });
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, assets: applyBatchUpdates(p.assets) } : p,
    ),
  }));
}

function addCashflowLegAction(set: SetFn): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      cashflowLegs: [
        ...(state.parameters.cashflowLegs || []),
        { id: `cf-${Date.now()}`, amount: 0, type: 'contribution', frequency: 'yearly', offset: 0 },
      ],
    },
  }));
}

function removeCashflowLegAction(set: SetFn, id: string): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      cashflowLegs: (state.parameters.cashflowLegs || []).filter((l) => l.id !== id),
    },
  }));
}

function updateCashflowLegAction(set: SetFn, id: string, updates: Partial<CashflowLeg>): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      cashflowLegs: (state.parameters.cashflowLegs || []).map((l) =>
        l.id === id ? { ...l, ...updates } : l,
      ),
    },
  }));
}

function addOneTimeCashflowAction(set: SetFn): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      oneTimeCashflows: [
        ...(state.parameters.oneTimeCashflows || []),
        {
          id: `otc-${Date.now()}`,
          amount: 0,
          type: 'contribution',
          date: state.parameters.startDate,
        },
      ],
    },
  }));
}

function removeOneTimeCashflowAction(set: SetFn, id: string): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      oneTimeCashflows: (state.parameters.oneTimeCashflows || []).filter((c) => c.id !== id),
    },
  }));
}

function updateOneTimeCashflowAction(
  set: SetFn,
  id: string,
  updates: Partial<OneTimeCashflow>,
): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      oneTimeCashflows: (state.parameters.oneTimeCashflows || []).map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    },
  }));
}

export const useBacktestStore = create<BacktestState>((set, get) => ({
  portfolios: [createDefaultPortfolio(1)],
  parameters: defaultParameters,
  results: null,
  isLoading: false,
  activeTab: 'summary',
  portfolioCounter: 1,
  hasLoadedFromShare: false,
  _abortController: null as AbortController | null,

  addPortfolio: () => addPortfolioAction(set, get),
  addGlidepath: (name, fromId, toId, years) =>
    addGlidepathAction({ set, get, name, fromId, toId, years }),
  duplicatePortfolio: (id) => duplicatePortfolioAction(set, get, id),
  removePortfolio: (id) => removePortfolioAction(set, id),
  addAsset: (portfolioId) => addAssetAction(set, portfolioId),
  removeAsset: (portfolioId, ticker) => removeAssetAction(set, portfolioId, ticker),
  updateAsset: (portfolioId, assetIndex, updates) =>
    updateAssetAction(set, portfolioId, assetIndex, updates),
  batchUpdateAssets: (portfolioId, updates) => batchUpdateAssetsAction(set, portfolioId, updates),
  updatePortfolio: (id, updates) =>
    set((state) => ({
      portfolios: state.portfolios.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  updateParameter: (key, value) =>
    set((state) => ({ parameters: { ...state.parameters, [key]: value } })),
  addCashflowLeg: () => addCashflowLegAction(set),
  removeCashflowLeg: (id) => removeCashflowLegAction(set, id),
  updateCashflowLeg: (id, updates) => updateCashflowLegAction(set, id, updates),
  addOneTimeCashflow: () => addOneTimeCashflowAction(set),
  removeOneTimeCashflow: (id) => removeOneTimeCashflowAction(set, id),
  updateOneTimeCashflow: (id, updates) => updateOneTimeCashflowAction(set, id, updates),
  setResults: (results) => set({ results }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setHasLoadedFromShare: (val) => set({ hasLoadedFromShare: val }),
  loadFromShare: (data) => loadFromShareAction(set, get, data),
  getShareableState: () => {
    const { portfolios, parameters } = get();
    return { portfolios, parameters };
  },
  runBacktest: () => runBacktestAction(set, get),
  enrichSeries: (series) => enrichSeriesAction(set, get, series),
}));
