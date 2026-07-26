import { startTransition } from 'react';
import i18n from '../i18n/index.js';
import { apiFetch } from '../utils/apiClient.js';
import { reportError } from '../utils/errorReporter.js';
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
import type { SetFn, GetFn, BacktestSeriesField, DateRangeInfo } from './types.js';
import type { WarningInfo } from '../utils/errorI18nMap.js';
import { processResponseWarnings, extractDateRange } from '../utils/responseWarnings.js';

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
  reportError(error, { component: 'executionSlice', action: 'handleBacktestError' });
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

function cancellableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
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

/**
 * 轮询异步回测任务状态（P0-03）。指数退避：500ms -> 1s -> 2s -> 4s -> 5s（上限）。
 * 完成时返回与同步 200 响应同构的结果 JSON，供 normalizeBacktestResult 等统一处理。
 *
 * @param statusUrl - 任务状态查询 URL（/api/v1/backtest/runs/:jobId）
 * @param signal - AbortSignal，用于取消轮询（用户主动取消或 180s 超时）
 * @param requestId - 当前请求 ID，用于竞态检测（新请求发起时中止旧轮询）
 * @returns 完成时的结果 JSON（形状与同步 200 响应一致）
 * @throws {DOMException} AbortError - 用户取消或超时
 * @throws {Error} 任务失败或状态查询异常
 */
async function pollJobStatus(
  statusUrl: string,
  signal: AbortSignal,
  requestId: number,
): Promise<Record<string, unknown>> {
  let delay = 500;
  const maxDelay = 5000;

  while (true) {
    if (signal.aborted || requestId !== currentRequestId) {
      throw new DOMException('Aborted', 'AbortError');
    }
    await cancellableSleep(delay, signal);
    if (signal.aborted || requestId !== currentRequestId) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const pollResponse = await apiFetch(statusUrl, {
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    const pollJson = await pollResponse.json();
    if (!pollResponse.ok || pollJson.success === false) {
      throw new Error(extractApiErrorDetail(pollJson));
    }

    const jobData = pollJson.data as {
      status: string;
      result?: { data: unknown; warnings: unknown[]; dateRange: unknown };
      error?: string;
    };

    if (jobData.status === 'completed' && jobData.result) {
      return {
        success: true,
        data: jobData.result.data,
        warnings: jobData.result.warnings,
        dateRange: jobData.result.dateRange,
      } as Record<string, unknown>;
    }
    if (jobData.status === 'failed') {
      throw new Error(jobData.error || i18n.t('backtest.runFailed'));
    }
    delay = Math.min(delay * 2, maxDelay);
  }
}

async function runBacktestAction(set: SetFn, get: GetFn): Promise<void> {
  const requestId = ++currentRequestId;
  const prevController = get()._abortController;
  if (prevController) prevController.abort();
  const controller = new AbortController();
  set({ _abortController: controller, isLoading: true, warnings: [], dateRange: null });

  const { portfolios, parameters } = get();

  if (portfolios.length === 0) {
    useToastStore.getState().addToast('warning', i18n.t('backtest.emptyPortfolios'));
    if (requestId === currentRequestId) set({ isLoading: false, _abortController: null });
    return;
  }

  const validationError = validatePortfolios(portfolios);
  if (validationError) {
    useToastStore.getState().addToast('warning', validationError);
    if (requestId === currentRequestId) set({ isLoading: false, _abortController: null });
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
      set({ results: null, warnings: [], dateRange: null });
      return;
    }

    // P0-03: 202 Accepted -> 异步轮询 GET /runs/:jobId（指数退避 500ms->5s）
    // 200 OK -> 同步结果，直接处理
    let resultJson = json;
    if (response.status === 202) {
      resultJson = await pollJobStatus(json.data.statusUrl as string, controller.signal, requestId);
    }

    const results = normalizeBacktestResult(resultJson.data ?? resultJson);
    const warnings = processResponseWarnings(resultJson);
    const dateRange = extractDateRange(resultJson, warnings);

    if (requestId === currentRequestId) {
      set({ isLoading: false });
      startTransition(() => {
        set({ results, warnings, dateRange, activeTab: 'summary' });
      });
    }
  } catch (error) {
    if (requestId !== currentRequestId) return;
    handleBacktestError(error);
    set({ results: null, warnings: [], dateRange: null });
  } finally {
    clearTimeout(timeoutId);
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
    reportError(error, { component: 'executionSlice', action: 'enrichBacktestSeries' });
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

export function executionSlice(set: SetFn, get: GetFn) {
  return {
    results: null as BacktestResult | null,
    warnings: [] as WarningInfo[],
    dateRange: null as DateRangeInfo | null,
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
