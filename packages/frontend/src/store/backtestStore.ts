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
import { useSettingsStore } from './settingsStore.js';
import {
  extractApiErrorDetail,
  normalizeBacktestResult,
  validatePortfolios,
  defaultParameters,
  createEmptyPortfolio,
  createPortfolioFromPreset,
  buildBacktestRequestBody,
  handleBacktestError,
  cancellableSleep,
} from './backtestHelpers.js';
export type BacktestSeriesField = 'rollingReturns' | 'allocationHistory' | 'drawdownEpisodes';
export interface BacktestState {
  portfolios: Portfolio[];
  portfolioCounter: number;
  results: BacktestResult | null;
  resultsStale: boolean;
  error: string | null;
  isLoading: boolean;
  activeTab: string;
  hasLoadedFromShare: boolean;
  _abortController: AbortController | null;
  parameters: BacktestParameters;
  addPortfolio: (presetId?: string) => void;
  removePortfolio: (id: string) => void;
  duplicatePortfolio: (id: string) => void;
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
        | 'isGlidepath'
        | 'glidepathFrom'
        | 'glidepathTo'
        | 'glidepathYears'
        | 'glidepathToWeights'
        | 'tags'
      >
    >,
  ) => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  updateParameter: <K extends keyof BacktestParameters>(
    key: K,
    value: BacktestParameters[K],
  ) => void;
  runBacktest: () => Promise<void>;
  enrichSeries: (series: BacktestSeriesField[]) => Promise<void>;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
}
export type SetFn = (
  partial: Partial<BacktestState> | ((state: BacktestState) => Partial<BacktestState>),
) => void;
export type GetFn = () => BacktestState;

let currentRequestId = 0;

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
    const res = await apiFetch(statusUrl, { cache: 'no-store', signal });
    const json = await res.json();
    if (!res.ok || json.success === false) throw new Error(extractApiErrorDetail(json));
    const jd = json.data as {
      status?: string;
      state?: string;
      result?: { data?: unknown; warnings: unknown[]; dateRange: unknown };
      error?: string;
    };
    const js = jd.status ?? jd.state;
    if (js === 'completed' && jd.result)
      return { success: true, data: (jd.result.data ?? jd.result) as unknown } as Record<
        string,
        unknown
      >;
    if (js === 'failed')
      throw new Error(
        jd.error || i18n.t('Backtest failed. Please check ticker symbols and parameters.'),
      );
    delay = Math.min(delay * 2, 500);
  }
}

const setIfCurrent = (set: SetFn, rid: number, patch: Partial<BacktestState>) => {
  if (rid === currentRequestId) set(patch);
};
const stale = <T>(patch: T): T & { resultsStale: true } => ({ ...patch, resultsStale: true });

async function runBacktestAction(set: SetFn, get: GetFn): Promise<void> {
  const rid = ++currentRequestId;
  const prev = get()._abortController;
  if (prev) prev.abort();
  const ctrl = new AbortController();
  set({ _abortController: ctrl, isLoading: true, error: null });
  const { portfolios, parameters } = get();
  const abort = (msg?: string) => {
    if (msg) useToastStore.getState().addToast('warning', msg);
    setIfCurrent(set, rid, { isLoading: false, _abortController: null });
  };
  if (portfolios.length === 0) {
    abort(i18n.t('Please add at least one portfolio'));
    return;
  }
  const ve = validatePortfolios(portfolios);
  if (ve) {
    abort(ve);
    return;
  }
  const tid = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await apiFetch('/api/v1/backtest/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify(buildBacktestRequestBody(portfolios, parameters)),
      silent: true,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(extractApiErrorDetail(json));
    if (json.success === false) {
      useToastStore.getState().addToast('error', extractApiErrorDetail(json));
      set({ error: extractApiErrorDetail(json) });
      return;
    }
    const rj =
      res.status === 202
        ? await pollJobStatus(json.data.statusUrl as string, ctrl.signal, rid)
        : json;
    const results = normalizeBacktestResult(rj.data ?? rj);
    processResponseWarnings(rj);
    if (rid === currentRequestId)
      startTransition(() => set({ results, error: null, resultsStale: false }));
  } catch (error) {
    if (rid !== currentRequestId) return;
    set({ error: handleBacktestError(error) });
  } finally {
    clearTimeout(tid);
    setIfCurrent(set, rid, { isLoading: false, _abortController: null });
  }
}

async function enrichSeriesAction(
  set: SetFn,
  get: GetFn,
  series: BacktestSeriesField[],
): Promise<void> {
  const { portfolios, parameters, results } = get();
  if (!results?.portfolios?.length) return;
  const missing = series.filter((f) =>
    results.portfolios.some((p) => {
      const v = p[f];
      return v === undefined || (Array.isArray(v) && v.length === 0);
    }),
  );
  if (missing.length === 0) return;
  try {
    const res = await apiFetch('/api/v1/backtest/portfolio/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildBacktestRequestBody(portfolios, parameters),
        series: missing,
      }),
    });
    const json = await res.json();
    if (!res.ok || json.success === false) return;
    const byName = new Map(
      ((json.data?.portfolios ?? []) as PortfolioResult[]).map((p) => [p.name, p]),
    );
    startTransition(() => {
      const cur = get().results;
      if (!cur?.portfolios?.length) return;
      set({
        results: normalizeBacktestResult({
          ...cur,
          portfolios: cur.portfolios.map((p) => {
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
  useSettingsStore.getState().setCurrency(data.parameters.baseCurrency ?? 'usd');
  const maxId = data.portfolios.reduce((mx, p) => {
    const m = p.id?.match(/-(\d+)$/);
    return m ? Math.max(mx, parseInt(m[1])) : mx;
  }, get().portfolioCounter);
  set({
    portfolios: data.portfolios.map((p) => ({
      ...p,
      id: p.id || `portfolio-${Date.now()}-${maxId + 1}`,
    })),
    parameters: { ...defaultParameters, ...data.parameters },
    results: null,
    resultsStale: false,
    error: null,
    activeTab: 'summary' as const,
    portfolioCounter: maxId,
    hasLoadedFromShare: true,
  });
}

const mapPortfolio = (
  st: BacktestState,
  id: string,
  fn: (p: Portfolio) => Portfolio,
): Portfolio[] => st.portfolios.map((p) => (p.id === id ? fn(p) : p));
const patchParams = <T extends CashflowLeg | OneTimeCashflow>(
  set: SetFn,
  key: 'cashflowLegs' | 'oneTimeCashflows',
  fn: (l: T[], st: BacktestState) => T[],
) =>
  set((st) =>
    stale({
      parameters: {
        ...st.parameters,
        [key]: fn((st.parameters[key] as T[] | undefined) ?? [], st),
      },
    }),
  );
const patchAssets = (set: SetFn, id: string, fn: (p: Portfolio) => Portfolio) =>
  set((st) => stale({ portfolios: mapPortfolio(st, id, fn) }));

function crudActions<T extends CashflowLeg | OneTimeCashflow>(
  set: SetFn,
  key: 'cashflowLegs' | 'oneTimeCashflows',
  make: (st: BacktestState) => T,
) {
  return {
    add: () => patchParams<T>(set, key, (l, s) => [...l, make(s)]),
    remove: (id: string) => patchParams<T>(set, key, (l) => l.filter((x) => x.id !== id)),
    update: (id: string, u: Partial<T>) =>
      patchParams<T>(set, key, (l) => l.map((x) => (x.id === id ? { ...x, ...u } : x))),
  };
}

export const useBacktestStore = create<BacktestState>()((set, get) => {
  const cf = crudActions(
    set,
    'cashflowLegs',
    () =>
      ({
        id: `cf-${Date.now()}`,
        amount: 0,
        type: 'contribution',
        frequency: 'yearly',
      }) as CashflowLeg,
  );
  const otc = crudActions(
    set,
    'oneTimeCashflows',
    (s) =>
      ({
        id: `otc-${Date.now()}`,
        amount: 0,
        type: 'contribution',
        date: s.parameters.startDate,
      }) as OneTimeCashflow,
  );
  return {
    portfolios: [] as Portfolio[],
    portfolioCounter: 0,
    results: null as BacktestResult | null,
    resultsStale: false,
    error: null as string | null,
    isLoading: false,
    activeTab: 'summary',
    hasLoadedFromShare: false,
    _abortController: null as AbortController | null,
    parameters: defaultParameters as BacktestParameters,
    addPortfolio: (presetId?: string) => {
      const next = get().portfolioCounter + 1;
      set((st) =>
        stale({
          portfolioCounter: next,
          portfolios: [
            ...st.portfolios,
            presetId ? createPortfolioFromPreset(presetId, next) : createEmptyPortfolio(next),
          ],
        }),
      );
    },
    removePortfolio: (id: string) =>
      set((st) => stale({ portfolios: st.portfolios.filter((p) => p.id !== id) })),
    duplicatePortfolio: (id: string) => {
      const next = get().portfolioCounter + 1;
      set((st) => {
        const src = st.portfolios.find((p) => p.id === id);
        if (!src) return st;
        return stale({
          portfolioCounter: next,
          portfolios: [
            ...st.portfolios,
            {
              ...src,
              id: `portfolio-${Date.now()}-${next}`,
              name: `${src.name} (${i18n.t('Copy')})`,
              assets: src.assets.map((a) => ({ ...a })),
            },
          ],
        });
      });
    },
    updatePortfolio: (id, updates) => patchAssets(set, id, (p) => ({ ...p, ...updates })),
    addGlidepath: (name: string, fromId: string, toId: string, years: number) => {
      const next = get().portfolioCounter + 1;
      set((st) => {
        const from = st.portfolios.find((p) => p.id === fromId);
        const to = st.portfolios.find((p) => p.id === toId);
        if (!from || !to) return st;
        return stale({
          portfolioCounter: next,
          portfolios: [
            ...st.portfolios,
            {
              id: `glidepath-${Date.now()}-${next}`,
              name,
              assets: from.assets.map((a) => ({ ...a })),
              rebalanceFrequency: from.rebalanceFrequency,
              rebalanceOffset: from.rebalanceOffset,
              drag: from.drag ?? 0,
              isGlidepath: true,
              glidepathFrom: fromId,
              glidepathTo: toId,
              glidepathYears: years,
              glidepathToWeights: from.assets.map((fa) => {
                const ta = to.assets.find((a) => a.ticker === fa.ticker);
                return ta ? ta.weight / 100 : 0;
              }),
            },
          ],
        });
      });
    },
    addCashflowLeg: cf.add,
    removeCashflowLeg: cf.remove,
    updateCashflowLeg: cf.update,
    addOneTimeCashflow: otc.add,
    removeOneTimeCashflow: otc.remove,
    updateOneTimeCashflow: otc.update,
    updateParameter: <K extends keyof BacktestParameters>(key: K, value: BacktestParameters[K]) =>
      set((st) => stale({ parameters: { ...st.parameters, [key]: value } })),
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
  };
});
