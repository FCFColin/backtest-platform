/* eslint-disable react-refresh/only-export-components -- 导出共享工具常量，Plan-1 拆分 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketStats } from '@backtest/shared/types';
import { apiFetch } from '../../utils/apiClient.js';
import { useToastStore } from '../../store/toastStore.js';
import { reportError } from '../../utils/errorReporter.js';
import {
  DataEngineActionButtons,
  DataEngineOverviewCards,
  DataEngineCoverageBars,
  SampleTickersCard,
  RecentUpdatesCard,
  UniverseInfo,
} from './dataEngineCards.js';
import {
  MarketDistributionCard,
  ExchangeDistributionCard,
  DecadeDistributionCard,
  YearCountDistributionCard,
} from './dataEngineDistribution.js';
export { DataEngineSkeleton } from './dataEngineSkeleton.js';

export type TFunc = ReturnType<typeof useTranslation>['t'];
export type Stats = MarketStats;
export interface UniverseStats {
  total: number;
  updated_at: string;
  stats: { total: number; stocks: number; etfs: number; indices: number; us: number; cn: number };
}
export type ActionMethod = 'POST' | 'PUT' | 'PATCH';
const MAX_POLL = 60;
const INITIAL_TIMEOUT_MS = 15_000;
const LOAD_STAGE_BOUNDS: Array<[number, string]> = [
  [1, 'connecting'],
  [10, 'scanningFiles'],
  [30, 'countingTickers'],
  [50, 'generatingReport'],
];
function getLoadStage(t: TFunc, count: number): string {
  const stage = LOAD_STAGE_BOUNDS.find(([max]) => count <= max);
  return t(stage ? `dataEngine.${stage[1]}` : 'dataEngine.almostReady');
}
function classifyError(t: TFunc, res: Response, json: Record<string, unknown> | null): string {
  const status = res.status || (typeof json?.status === 'number' ? json.status : 0);
  if (status === 401 || status === 403)
    return t(
      'Authentication failed: API Key invalid or missing, please check admin backend key configuration',
    );
  if (json?.errorType === 'scan_failed')
    return `${t('Data scan failed')}：${json.error || t('Unknown')}`;
  if (res.status >= 500)
    return t('Server error, please confirm backend service is running and retry');
  return t('Data load failed, please retry');
}
interface StatsRefs {
  pollCountRef: React.MutableRefObject<number>;
  fetchStartRef: React.MutableRefObject<number>;
}
interface StatsSetters {
  setStats: (v: Stats | null) => void;
  setUniverse: (v: UniverseStats | null) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
  setLoadStage: (v: string) => void;
  setScanning: (v: boolean) => void;
}
export async function doFetchStats(
  t: TFunc,
  force: boolean,
  refs: StatsRefs,
  setters: StatsSetters,
): Promise<void> {
  const t0 = Date.now();
  refs.fetchStartRef.current = t0;
  refs.pollCountRef.current = 0;
  setters.setLoading(true);
  setters.setError('');
  setters.setLoadStage(t('Connecting...'));
  const fail = (msg: string) => {
    setters.setLoading(false);
    setters.setError(msg);
  };
  // eslint-disable-next-line complexity -- 轮询状态机分支多，Plan-1 已拆分，保留可读性
  const poll = async (): Promise<void> => {
    let json: Record<string, unknown> | null = null;
    try {
      const res = await apiFetch(
        force ? '/api/v1/data/manage/stats?force=1' : '/api/v1/data/manage/stats',
      );
      if (refs.pollCountRef.current === 0 && Date.now() - t0 > INITIAL_TIMEOUT_MS) {
        fail(t('Connection timeout, please confirm backend service is running and retry'));
        return;
      }
      json = await res.json().catch(() => null);
      if (json === null) {
        fail(t('Server response abnormal, please confirm backend service is running and retry'));
        return;
      }
      if (!json.success) {
        fail(classifyError(t, res, json));
        return;
      }
      const data = json.data as Record<string, unknown> | undefined;
      if (data?.scanning) {
        setters.setScanning(true);
        refs.pollCountRef.current += 1;
        setters.setLoadStage(getLoadStage(t, refs.pollCountRef.current));
        if (refs.pollCountRef.current >= MAX_POLL) {
          setters.setScanning(false);
          fail(t('Data engine load timeout, please confirm backend service is running and retry'));
          return;
        }
        setTimeout(poll, 2000);
      } else {
        setters.setStats((data?.stats ?? null) as Stats | null);
        setters.setUniverse((data?.universe ?? null) as UniverseStats | null);
        setters.setScanning(false);
        setters.setLoadStage(t('Ready'));
        setters.setLoading(false);
      }
    } catch (e) {
      reportError(e, { component: 'DataEngine', action: 'fetchStats' });
      useToastStore.getState().addToast('error', t('Data engine stats load failed'));
      fail(
        e instanceof TypeError && e.message.includes('fetch')
          ? t(
              'Network error: unable to connect to server, please confirm backend service is running',
            )
          : t('Data load failed, please retry'),
      );
    }
  };
  await poll();
}
export async function doActionFn(
  t: TFunc,
  url: string,
  label: string,
  setActionMsg: (v: string) => void,
  method: ActionMethod = 'POST',
): Promise<void> {
  setActionMsg(`${label}...`);
  try {
    const res = await apiFetch(url, { method });
    const json = await res.json();
    setActionMsg(json.success ? `${label} ✓` : t('Error'));
  } catch {
    setActionMsg(t('Error'));
  }
  setTimeout(() => setActionMsg(''), 5000);
}
export function DataEngineDashboard(props: {
  stats: Stats;
  universe: UniverseStats | null;
  actionMsg: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string, method: ActionMethod) => void;
}) {
  const { stats, universe, actionMsg, fetchStats, doAction } = props;
  return (
    <>
      <DataEngineActionButtons actionMsg={actionMsg} fetchStats={fetchStats} doAction={doAction} />
      <DataEngineOverviewCards stats={stats} universe={universe} />
      <DataEngineCoverageBars stats={stats} universe={universe} />
      <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <MarketDistributionCard stats={stats} universe={universe} />
        <ExchangeDistributionCard stats={stats} />
      </div>
      <DecadeDistributionCard stats={stats} />
      <YearCountDistributionCard stats={stats} />
      <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SampleTickersCard stats={stats} />
        <RecentUpdatesCard />
      </div>
      {universe && <UniverseInfo universe={universe} />}
    </>
  );
}
