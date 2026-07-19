import { startTransition } from 'react';
import i18n from '../i18n/index.js';
import { apiFetch, notifyIfDegraded } from '../utils/apiClient.js';
import type {
  Portfolio,
  PortfolioResult,
  BacktestParameters,
  BacktestResult,
} from '@backtest/shared';
import { useToastStore } from './toastStore.js';
import {
  extractApiErrorDetail,
  normalizeBacktestResult,
  validatePortfolios,
  defaultParameters,
} from './backtestHelpers.js';
import type { SetFn, GetFn, BacktestSeriesField } from './types.js';

let currentRequestId = 0;

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

function processResponseWarnings(json: Record<string, unknown>): void {
  const warnings = json.warnings as string[] | undefined;
  if (warnings && warnings.length > 0) {
    for (const w of warnings) useToastStore.getState().addToast('warning', w);
  }
  // degraded 警告由 notifyIfDegraded 统一处理，不在此重复
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
    const response = await apiFetch('/api/v1/backtest/portfolio', {
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
    await notifyIfDegraded(response);

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
    console.error('Failed to enrich backtest series:', error);
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
    activeTab: 'growth' as const,
    portfolioCounter: maxId,
    hasLoadedFromShare: true,
  });
}

export function executionSlice(set: SetFn, get: GetFn) {
  return {
    results: null as BacktestResult | null,
    isLoading: false,
    activeTab: 'summary',
    hasLoadedFromShare: false,
    _abortController: null as AbortController | null,

    runBacktest: () => runBacktestAction(set, get),
    enrichSeries: (series: BacktestSeriesField[]) => enrichSeriesAction(set, get, series),
    setResults: (results: BacktestResult | null) => set({ results }),
    setActiveTab: (tab: string) => set({ activeTab: tab }),
    setHasLoadedFromShare: (val: boolean) => set({ hasLoadedFromShare: val }),
    loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) =>
      loadFromShareAction(set, get, data),
    getShareableState: () => {
      const { portfolios, parameters } = get();
      return { portfolios, parameters };
    },
  };
}
