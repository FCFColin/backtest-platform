import { create } from 'zustand';
import { startTransition } from 'react';
import i18n from '@/i18n/index.js';
import { apiFetch } from '@/utils/apiClient.js';
import { reportError, processResponseWarnings } from '@/utils/errorReporter.js';
import type {
  Portfolio,
  PortfolioResult,
  BacktestParameters,
  BacktestResult,
  CashflowLeg,
  OneTimeCashflow,
} from '@backtest/shared';
import { useToastStore } from './toastStore.js';
import {
  extractApiErrorDetail,
  normalizeBacktestResult,
  validatePortfolios,
  defaultParameters,
  createEmptyPortfolio,
  createPortfolioFromPreset,
} from './backtestHelpers.js';
import type { BacktestState, SetFn, GetFn, BacktestSeriesField } from './types.js';
let currentRequestId = 0;
const PORTFOLIO_BODY_KEYS = [
  'name',
  'assets',
  'rebalanceFrequency',
  'rebalanceThreshold',
  'rebalanceOffset',
  'rebalanceBands',
  'drag',
  'totalReturn',
  'isGlidepath',
  'glidepathToWeights',
  'glidepathYears',
] as const;
function buildBacktestRequestBody(portfolios: Portfolio[], parameters: BacktestParameters) {
  return {
    portfolios: portfolios.map((p) => {
      const out: Record<string, unknown> = {};
      for (const k of PORTFOLIO_BODY_KEYS) out[k] = p[k];
      return out;
    }),
    parameters,
  };
}
function handleBacktestError(error: unknown): void {
  reportError(error, { component: 'backtestStore', action: 'handleBacktestError' });
  const isAbort = error instanceof DOMException && error.name === 'AbortError';
  const msg = isAbort
    ? i18n.t('backtest.timeout')
    : error instanceof TypeError
      ? i18n.t('backtest.networkError')
      : (error instanceof Error && error.message) || i18n.t('backtest.runFailed');
  useToastStore.getState().addToast('error', msg);
}
function cancellableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
export async function pollJobStatus(
  statusUrl: string,
  signal: AbortSignal,
  requestId: number | null,
): Promise<Record<string, unknown>> {
  let delay = 50;
  while (true) {
    await cancellableSleep(delay, signal);
    if (signal.aborted || (requestId !== null && requestId !== currentRequestId))
      throw new DOMException('Aborted', 'AbortError');
    const pollResponse = await apiFetch(statusUrl, {
      headers: { 'Content-Type': 'application/json' },
      // 轮询结果每次都要最新值：禁用 HTTP 缓存，否则 ETag 命中返回 304（无 body），
      cache: 'no-store',
      signal,
    });
    const pollJson = await pollResponse.json();
    if (!pollResponse.ok || pollJson.success === false)
      throw new Error(extractApiErrorDetail(pollJson));
    const jobData = pollJson.data as {
      status?: string;
      state?: string;
      result?: { data: unknown; warnings: unknown[]; dateRange: unknown };
      error?: string;
    };
    const jobState = jobData.status ?? jobData.state;
    if (jobState === 'completed' && jobData.result) {
      return {
        success: true,
        data: jobData.result.data,
      } as Record<string, unknown>;
    }
    if (jobState === 'failed') throw new Error(jobData.error || i18n.t('backtest.runFailed'));
    delay = Math.min(delay * 2, 500);
  }
}
const setIfCurrent = (set: SetFn, requestId: number, patch: Partial<BacktestState>) => {
  if (requestId === currentRequestId) set(patch);
};
async function runBacktestAction(set: SetFn, get: GetFn): Promise<void> {
  const requestId = ++currentRequestId;
  const prevController = get()._abortController;
  if (prevController) prevController.abort();
  const controller = new AbortController();
  set({ _abortController: controller, isLoading: true });
  const { portfolios, parameters } = get();
  const abortEarly = (msg?: string) => {
    if (msg) useToastStore.getState().addToast('warning', msg);
    setIfCurrent(set, requestId, { isLoading: false, _abortController: null });
  };
  if (portfolios.length === 0) {
    abortEarly(i18n.t('backtest.emptyPortfolios'));
    return;
  }
  const validationError = validatePortfolios(portfolios);
  if (validationError) {
    abortEarly(validationError);
    return;
  }
  const timeoutId = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await apiFetch('/api/v1/backtest/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(buildBacktestRequestBody(portfolios, parameters)),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(extractApiErrorDetail(json));
    if (json.success === false) {
      useToastStore.getState().addToast('error', extractApiErrorDetail(json));
      set({ results: null });
      return;
    }
    const resultJson =
      response.status === 202
        ? await pollJobStatus(json.data.statusUrl as string, controller.signal, requestId)
        : json;
    const results = normalizeBacktestResult(resultJson.data ?? resultJson);
    processResponseWarnings(resultJson);
    if (requestId === currentRequestId) {
      startTransition(() => {
        set({ results, activeTab: 'summary' });
      });
    }
  } catch (error) {
    if (requestId !== currentRequestId) return;
    handleBacktestError(error);
    set({ results: null });
  } finally {
    clearTimeout(timeoutId);
    setIfCurrent(set, requestId, { isLoading: false, _abortController: null });
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
      const v = p[field];
      return v === undefined || (Array.isArray(v) && v.length === 0);
    }),
  );
  if (missing.length === 0) return;
  try {
    const response = await apiFetch('/api/v1/backtest/portfolio/series', {
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
    reportError(error, { component: 'backtestStore', action: 'enrichBacktestSeries' });
  }
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
    warnings: [],
    dateRange: null,
    activeTab: 'growth' as const,
    portfolioCounter: maxId,
    hasLoadedFromShare: true,
  });
}
const mapPortfolio = (
  state: BacktestState,
  id: string,
  fn: (p: Portfolio) => Portfolio,
): Portfolio[] => state.portfolios.map((p) => (p.id === id ? fn(p) : p));
const patchParams = <T extends CashflowLeg | OneTimeCashflow>(
  set: SetFn,
  key: 'cashflowLegs' | 'oneTimeCashflows',
  fn: (l: T[], state: BacktestState) => T[],
) =>
  set((state) => ({
    parameters: {
      ...state.parameters,
      [key]: fn((state.parameters[key] as T[] | undefined) ?? [], state),
    },
  }));
const patchAssets = (set: SetFn, id: string, fn: (p: Portfolio) => Portfolio) =>
  set((state) => ({ portfolios: mapPortfolio(state, id, fn) }));
// eslint-disable-next-line max-lines-per-function
export const useBacktestStore = create<BacktestState>()((set, get) => ({
  portfolios: [] as Portfolio[],
  portfolioCounter: 0,
  results: null as BacktestResult | null,
  isLoading: false,
  activeTab: 'summary',
  hasLoadedFromShare: false,
  _abortController: null as AbortController | null,
  parameters: defaultParameters as BacktestParameters,
  addPortfolio: (presetId?: string) => {
    const next = get().portfolioCounter + 1;
    set((state) => ({
      portfolioCounter: next,
      portfolios: [
        ...state.portfolios,
        presetId ? createPortfolioFromPreset(presetId, next) : createEmptyPortfolio(next),
      ],
    }));
  },
  removePortfolio: (id: string) =>
    set((state) => ({ portfolios: state.portfolios.filter((p) => p.id !== id) })),
  duplicatePortfolio: (id: string) => {
    const next = get().portfolioCounter + 1;
    set((state) => {
      const source = state.portfolios.find((p) => p.id === id);
      if (!source) return state;
      const copy: Portfolio = {
        ...source,
        id: `portfolio-${Date.now()}-${next}`,
        name: `${source.name} (${i18n.t('common.copy')})`,
        assets: source.assets.map((a) => ({ ...a })),
      };
      return { portfolioCounter: next, portfolios: [...state.portfolios, copy] };
    });
  },
  updatePortfolio: (
    id: string,
    updates: Partial<
      Pick<
        Portfolio,
        | 'name'
        | 'assets'
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
        | 'tags'
      >
    >,
  ) => patchAssets(set, id, (p) => ({ ...p, ...updates })),
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => {
    const next = get().portfolioCounter + 1;
    set((state) => {
      const from = state.portfolios.find((p) => p.id === fromId);
      const to = state.portfolios.find((p) => p.id === toId);
      if (!from || !to) return state;
      const toWeights = from.assets.map((fa) => {
        const ta = to.assets.find((a) => a.ticker === fa.ticker);
        return ta ? ta.weight / 100 : 0;
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
  },
  addCashflowLeg: () =>
    patchParams<CashflowLeg>(set, 'cashflowLegs', (l) => [
      ...l,
      { id: `cf-${Date.now()}`, amount: 0, type: 'contribution', frequency: 'yearly', offset: 0 },
    ]),
  removeCashflowLeg: (id: string) =>
    patchParams<CashflowLeg>(set, 'cashflowLegs', (l) => l.filter((x) => x.id !== id)),
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) =>
    patchParams<CashflowLeg>(set, 'cashflowLegs', (l) =>
      l.map((x) => (x.id === id ? { ...x, ...updates } : x)),
    ),
  addOneTimeCashflow: () =>
    patchParams<OneTimeCashflow>(set, 'oneTimeCashflows', (l, state) => [
      ...l,
      {
        id: `otc-${Date.now()}`,
        amount: 0,
        type: 'contribution',
        date: state.parameters.startDate,
      },
    ]),
  removeOneTimeCashflow: (id: string) =>
    patchParams<OneTimeCashflow>(set, 'oneTimeCashflows', (l) => l.filter((x) => x.id !== id)),
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) =>
    patchParams<OneTimeCashflow>(set, 'oneTimeCashflows', (l) =>
      l.map((x) => (x.id === id ? { ...x, ...updates } : x)),
    ),
  updateParameter: <K extends keyof BacktestParameters>(key: K, value: BacktestParameters[K]) =>
    set((state) => ({ parameters: { ...state.parameters, [key]: value } })),
  runBacktest: () => runBacktestAction(set, get),
  enrichSeries: (series: BacktestSeriesField[]) => enrichSeriesAction(set, get, series),
  setActiveTab: (tab: string) => set({ activeTab: tab }),
  setHasLoadedFromShare: (val: boolean) => set({ hasLoadedFromShare: val }),
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) =>
    loadFromShareAction(set, get, data),
  getShareableState: () => {
    const { portfolios, parameters } = get();
    return { portfolios, parameters };
  },
}));
