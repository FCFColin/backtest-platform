/** @file DataEngine utility functions */
import type { Stats, TFunc, UniverseStats } from './types.js';
import { MAX_POLL, INITIAL_TIMEOUT_MS } from './types.js';
import { apiFetch } from '../../utils/apiClient.js';
import { useToastStore } from '../../store/toastStore.js';

export const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

export const pct = (n: number | undefined | null, total: number) => {
  const val = n ?? 0;
  return total > 0 ? `${((val / total) * 100).toFixed(1)}%` : '0%';
};

export function formatStorageMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function historySpanYears(earliest?: string | null, latest?: string | null): number | null {
  if (!earliest || !latest) return null;
  const y0 = parseInt(earliest.slice(0, 4), 10);
  const y1 = parseInt(latest.slice(0, 4), 10);
  if (Number.isNaN(y0) || Number.isNaN(y1) || y1 < y0) return null;
  return y1 - y0;
}

function getLoadStage(t: TFunc, count: number): string {
  if (count <= 3) return t('dataEngine.connecting');
  if (count <= 10) return t('dataEngine.scanningFiles');
  if (count <= 30) return t('dataEngine.countingTickers');
  if (count <= 50) return t('dataEngine.generatingReport');
  return t('dataEngine.almostReady');
}

function classifyError(t: TFunc, res: Response, json: Record<string, unknown> | null): string {
  const status = res.status || (typeof json?.status === 'number' ? json.status : 0);
  if (status === 401 || status === 403) return t('dataEngine.authFailed');
  if (json?.errorType === 'scan_failed')
    return `${t('dataEngine.scanFailed')}：${json.error || t('dataEngine.unknown')}`;
  if (res.status >= 500) return t('dataEngine.serverError');
  return t('dataEngine.loadFailed');
}

interface PollCtx {
  t: TFunc;
  force: boolean;
  t0: number;
  pollCountRef: React.MutableRefObject<number>;
  fetchStartRef: React.MutableRefObject<number>;
  setStats: (v: Stats | null) => void;
  setUniverse: (v: UniverseStats | null) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
  setLoadStage: (v: string) => void;
  setScanning: (v: boolean) => void;
  poll: () => void;
}

function handlePollSuccess(ctx: PollCtx, json: Record<string, unknown>) {
  const data = json.data as Record<string, unknown> | undefined;
  if (data?.scanning) {
    ctx.setScanning(true);
    ctx.pollCountRef.current += 1;
    ctx.setLoadStage(getLoadStage(ctx.t, ctx.pollCountRef.current));
    if (ctx.pollCountRef.current >= MAX_POLL) {
      ctx.setScanning(false);
      ctx.setLoading(false);
      ctx.setError(ctx.t('dataEngine.loadTimeout'));
      return;
    }
    setTimeout(ctx.poll, 2000);
  } else {
    ctx.setStats((data?.stats ?? null) as Stats | null);
    ctx.setUniverse((data?.universe ?? null) as UniverseStats | null);
    ctx.setScanning(false);
    ctx.setLoadStage(ctx.t('dataEngine.ready'));
    ctx.setLoading(false);
    console.debug(
      `[DataEnginePage] fetchStats 总耗时 ${Date.now() - ctx.t0}ms (pollCount=${ctx.pollCountRef.current})`,
    );
  }
}

async function createPoll(ctx: Omit<PollCtx, 'poll'>): Promise<void> {
  const poll = async () => {
    const fullCtx: PollCtx = { ...ctx, poll };
    try {
      const statsUrl = ctx.force ? '/api/data/manage/stats?force=1' : '/api/data/manage/stats';
      const res = await apiFetch(statsUrl);
      if (
        ctx.pollCountRef.current === 0 &&
        Date.now() - ctx.fetchStartRef.current > INITIAL_TIMEOUT_MS
      ) {
        ctx.setLoading(false);
        ctx.setError(ctx.t('dataEngine.connectionTimeout'));
        return;
      }
      let json: Record<string, unknown> | null = null;
      try {
        json = await res.json();
      } catch {
        ctx.setLoading(false);
        ctx.setError(ctx.t('dataEngine.serverAbnormal'));
        return;
      }
      if (json && json.success) handlePollSuccess(fullCtx, json);
      else {
        ctx.setLoading(false);
        ctx.setError(classifyError(ctx.t, res, json));
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
      useToastStore.getState().addToast('error', ctx.t('dataEngine.statsLoadFailed'));
      ctx.setLoading(false);
      ctx.setError(
        e instanceof TypeError && e.message.includes('fetch')
          ? ctx.t('dataEngine.networkError')
          : ctx.t('dataEngine.loadFailed'),
      );
    }
  };
  await poll();
}

export async function doFetchStats(
  t: TFunc,
  force: boolean,
  refs: {
    pollCountRef: React.MutableRefObject<number>;
    fetchStartRef: React.MutableRefObject<number>;
  },
  setters: {
    setStats: (v: Stats | null) => void;
    setUniverse: (v: UniverseStats | null) => void;
    setLoading: (v: boolean) => void;
    setError: (v: string) => void;
    setLoadStage: (v: string) => void;
    setScanning: (v: boolean) => void;
  },
) {
  const t0 = Date.now();
  refs.fetchStartRef.current = t0;
  setters.setLoading(true);
  setters.setError('');
  setters.setLoadStage(t('dataEngine.connecting'));
  refs.pollCountRef.current = 0;
  await createPoll({
    t,
    force,
    t0,
    pollCountRef: refs.pollCountRef,
    fetchStartRef: refs.fetchStartRef,
    ...setters,
  });
}

export async function doActionFn(
  t: TFunc,
  url: string,
  label: string,
  setActionMsg: (v: string) => void,
) {
  setActionMsg(`${label}...`);
  try {
    const res = await apiFetch(url, { method: 'POST' });
    const json = await res.json();
    setActionMsg(json.success ? `${label} ✓` : t('common.error'));
  } catch {
    setActionMsg(t('common.error'));
  }
  setTimeout(() => setActionMsg(''), 5000);
}
