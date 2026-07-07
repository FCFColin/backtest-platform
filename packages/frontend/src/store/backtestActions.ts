import { startTransition } from 'react';
import i18n from '../i18n/index.js';
import type { Portfolio, PortfolioResult, BacktestParameters } from '@backtest/shared';
import type { BacktestState, BacktestSeriesField, SetFn, GetFn } from './backtestStore.js';
import { useToastStore } from './toastStore.js';
import {
  extractApiErrorDetail,
  normalizeBacktestResult,
  validatePortfolios,
} from './utils/backtestHelpers.js';

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

export function createRunActions(
  set: SetFn,
  get: GetFn,
): Pick<BacktestState, 'runBacktest' | 'enrichSeries' | 'addGlidepath' | 'duplicatePortfolio'> {
  return {
    runBacktest: () => runBacktestAction(set, get),
    enrichSeries: (series) => enrichSeriesAction(set, get, series),
    addGlidepath: (name, fromId, toId, years) =>
      addGlidepathAction({ set, get, name, fromId, toId, years }),
    duplicatePortfolio: (id) => duplicatePortfolioAction(set, get, id),
  };
}
