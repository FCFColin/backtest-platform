import { create } from 'zustand';
import { startTransition } from 'react';
import i18n from '@/i18n/index.js';
import { apiFetch } from '@/utils/apiClient.js';
import { reportError, processResponseWarnings, type WarningInfo } from '@/utils/errorReporter.js';
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
type PP = Pick<
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
>;
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
  dataQualityWarnings: WarningInfo[];
  addPortfolio: (presetId?: string) => void;
  removePortfolio: (id: string) => void;
  duplicatePortfolio: (id: string) => void;
  updatePortfolio: (id: string, updates: Partial<PP>) => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  updateParameter: <K extends keyof BacktestParameters>(k: K, v: BacktestParameters[K]) => void;
  runBacktest: () => Promise<void>;
  enrichSeries: (series: BacktestSeriesField[]) => Promise<void>;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
}
type StatePatch = Partial<BacktestState> | ((s: BacktestState) => Partial<BacktestState>);
export type SetFn = (p: StatePatch) => void;
export type GetFn = () => BacktestState;
let currentRequestId = 0;
interface JobEnvelope {
  success?: boolean;
  error?: unknown;
  data?: {
    status?: string;
    state?: string;
    error?: string;
    result?: { data?: BacktestResultLike } & BacktestResultLike;
  };
}
type BacktestResultLike = Record<string, unknown>;
interface JobStatus {
  success: true;
  data: BacktestResultLike;
}
export async function pollJobStatus(
  url: string,
  signal: AbortSignal,
  rid: number | null,
): Promise<JobStatus> {
  for (let d = 50; ; d = Math.min(d * 2, 500)) {
    await cancellableSleep(d, signal);
    if (signal.aborted || (rid !== null && rid !== currentRequestId))
      throw new DOMException('Aborted', 'AbortError');
    const r = await apiFetch(url, { cache: 'no-store', signal }),
      j = (await r.json()) as JobEnvelope;
    if (!r.ok || j.success === false) throw new Error(extractApiErrorDetail(j));
    const x = j.data;
    const s = x?.status ?? x?.state;
    if (s === 'completed' && x?.result) return { success: true, data: x.result.data ?? x.result };
    if (s === 'failed')
      throw new Error(
        x?.error || i18n.t('Backtest failed. Please check ticker symbols and parameters.'),
      );
  }
}
const setIfCurrent = (set: SetFn, rid: number, patch: Partial<BacktestState>) => {
  if (rid === currentRequestId) set(patch);
};
const stale = <T>(p: T): T & { resultsStale: true } => ({ ...p, resultsStale: true });
async function runBacktestAction(set: SetFn, get: GetFn): Promise<void> {
  const rid = ++currentRequestId;
  get()._abortController?.abort();
  const ctrl = new AbortController();
  set({ _abortController: ctrl, isLoading: true, error: null });
  const { portfolios, parameters } = get();
  const abort = (m?: string) => {
    if (m) useToastStore.getState().addToast('warning', m);
    setIfCurrent(set, rid, { isLoading: false, _abortController: null });
  };
  if (!portfolios.length) return abort(i18n.t('Please add at least one portfolio'));
  const ve = validatePortfolios(portfolios);
  if (ve) return abort(ve);
  const tid = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await apiFetch('/api/v1/backtest/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify(buildBacktestRequestBody(portfolios, parameters)),
        silent: true,
      }),
      json = await res.json();
    if (!res.ok) throw new Error(extractApiErrorDetail(json));
    if (json.success === false) {
      useToastStore.getState().addToast('error', extractApiErrorDetail(json));
      set({ error: extractApiErrorDetail(json) });
      return;
    }
    const rj =
        res.status === 202
          ? await pollJobStatus(json.data.statusUrl as string, ctrl.signal, rid)
          : json,
      results = normalizeBacktestResult(rj.data ?? rj),
      dq = processResponseWarnings(rj);
    if (rid === currentRequestId)
      startTransition(() =>
        set({ results, error: null, resultsStale: false, dataQualityWarnings: dq }),
      );
  } catch (e) {
    if (rid !== currentRequestId) return;
    set({ error: handleBacktestError(e) });
  } finally {
    clearTimeout(tid);
    setIfCurrent(set, rid, { isLoading: false, _abortController: null });
  }
}
const isEmptyField = (v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0);
async function enrichSeriesAction(
  set: SetFn,
  get: GetFn,
  series: BacktestSeriesField[],
): Promise<void> {
  const { portfolios, parameters, results } = get();
  if (!results?.portfolios?.length) return;
  const missing = series.filter((f) => results.portfolios.some((p) => isEmptyField(p[f])));
  if (!missing.length) return;
  try {
    const res = await apiFetch('/api/v1/backtest/portfolio/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildBacktestRequestBody(portfolios, parameters),
          series: missing,
        }),
      }),
      json = await res.json();
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
  } catch (e) {
    reportError(e, { component: 'backtestStore', action: 'enrichBacktestSeries' });
  }
}
type CF = CashflowLeg | OneTimeCashflow;
const patchParams = <T extends CF>(
  set: SetFn,
  key: 'cashflowLegs' | 'oneTimeCashflows',
  fn: (l: T[], s: BacktestState) => T[],
) =>
  set((s) =>
    stale({
      parameters: { ...s.parameters, [key]: fn((s.parameters[key] as T[] | undefined) ?? [], s) },
    }),
  );
const patchAssets = (set: SetFn, id: string, fn: (p: Portfolio) => Portfolio) =>
  set((s) => stale({ portfolios: s.portfolios.map((p) => (p.id === id ? fn(p) : p)) }));
type PfMaker = (n: number, s: BacktestState) => Portfolio | null | undefined;
const pushPf = (set: SetFn, get: GetFn, mk: PfMaker) => {
  const n = get().portfolioCounter + 1;
  set((s) => {
    const pf = mk(n, s);
    return pf ? stale({ portfolioCounter: n, portfolios: [...s.portfolios, pf] }) : s;
  });
};
function crudActions<T extends CF>(
  set: SetFn,
  key: 'cashflowLegs' | 'oneTimeCashflows',
  make: (s: BacktestState) => T,
) {
  return {
    add: () => patchParams<T>(set, key, (l, s) => [...l, make(s)]),
    remove: (id: string) => patchParams<T>(set, key, (l) => l.filter((x) => x.id !== id)),
    update: (id: string, u: Partial<T>) =>
      patchParams<T>(set, key, (l) => l.map((x) => (x.id === id ? { ...x, ...u } : x))),
  };
}
export const useBacktestStore = create<BacktestState>()((set, get) => {
  const cfBase = { amount: 0, type: 'contribution' } as const,
    mkCf = (): CashflowLeg => ({ id: `cf-${Date.now()}`, ...cfBase, frequency: 'yearly' }),
    mkOtc = (s: BacktestState): OneTimeCashflow => ({
      id: `otc-${Date.now()}`,
      ...cfBase,
      date: s.parameters.startDate,
    }),
    cf = crudActions(set, 'cashflowLegs', mkCf),
    ot = crudActions(set, 'oneTimeCashflows', mkOtc);
  return {
    portfolios: [] as Portfolio[],
    portfolioCounter: 0,
    results: null as BacktestResult | null,
    dataQualityWarnings: [] as WarningInfo[],
    resultsStale: false,
    error: null as string | null,
    isLoading: false,
    activeTab: 'summary',
    hasLoadedFromShare: false,
    _abortController: null as AbortController | null,
    parameters: defaultParameters as BacktestParameters,
    addPortfolio: (p?: string) =>
      pushPf(set, get, (n) => (p ? createPortfolioFromPreset(p, n) : createEmptyPortfolio(n))),
    removePortfolio: (id: string) =>
      set((s) => stale({ portfolios: s.portfolios.filter((x) => x.id !== id) })),
    duplicatePortfolio: (id: string) =>
      pushPf(set, get, (n, s) => {
        const src = s.portfolios.find((x) => x.id === id);
        if (!src) return;
        return {
          ...src,
          id: `portfolio-${Date.now()}-${n}`,
          name: `${src.name} (${i18n.t('Copy')})`,
          assets: src.assets.map((a) => ({ ...a })),
        };
      }),
    updatePortfolio: (id, u) => patchAssets(set, id, (p) => ({ ...p, ...u })),
    addGlidepath: (name: string, fromId: string, toId: string, years: number) =>
      pushPf(set, get, (n, s) => {
        const f = s.portfolios.find((x) => x.id === fromId),
          t = s.portfolios.find((x) => x.id === toId);
        if (!f || !t) return;
        return {
          id: `glidepath-${Date.now()}-${n}`,
          name,
          assets: f.assets.map((a) => ({ ...a })),
          rebalanceFrequency: f.rebalanceFrequency,
          rebalanceOffset: f.rebalanceOffset,
          drag: f.drag ?? 0,
          isGlidepath: true,
          glidepathFrom: fromId,
          glidepathTo: toId,
          glidepathYears: years,
          glidepathToWeights: f.assets.map(
            (a) => (t.assets.find((x) => x.ticker === a.ticker)?.weight ?? 0) / 100,
          ),
        };
      }),
    addCashflowLeg: cf.add,
    removeCashflowLeg: cf.remove,
    updateCashflowLeg: cf.update,
    addOneTimeCashflow: ot.add,
    removeOneTimeCashflow: ot.remove,
    updateOneTimeCashflow: ot.update,
    updateParameter: <K extends keyof BacktestParameters>(k: K, v: BacktestParameters[K]) =>
      set((s) => stale({ parameters: { ...s.parameters, [k]: v } })),
    runBacktest: () => runBacktestAction(set, get),
    enrichSeries: (series: BacktestSeriesField[]) => enrichSeriesAction(set, get, series),
    setActiveTab: (t: string) => set({ activeTab: t }),
    setHasLoadedFromShare: (v: boolean) => set({ hasLoadedFromShare: v }),
    loadFromShare: (data) => {
      useSettingsStore.getState().setCurrency(data.parameters.baseCurrency ?? 'usd');
      const maxId = data.portfolios.reduce((m, p) => {
        const x = p.id?.match(/-(\d+)$/);
        return x ? Math.max(m, parseInt(x[1])) : m;
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
        activeTab: 'summary',
        portfolioCounter: maxId,
        hasLoadedFromShare: true,
      });
    },
    getShareableState: () => ({ portfolios: get().portfolios, parameters: get().parameters }),
  };
});
