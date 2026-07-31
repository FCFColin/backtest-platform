/* eslint-disable react-refresh/only-export-components -- 导出共享工具常量，Plan-1 拆分 */
import * as React from 'react';
import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Play,
  RotateCcw,
  Zap,
  Database,
  BarChart3,
  Clock,
  HardDrive,
} from 'lucide-react';
import {
  BarChart,
  Bar as RechartsBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { Card, Button, Skeleton } from '@/components/ui/uiComponents';
import type { MarketStats } from '@backtest/shared/types';
import { apiFetch } from '../../utils/apiClient.js';
import { useToastStore } from '../../store/toastStore.js';
import { reportError } from '../../utils/errorReporter.js';
import { useAuthStore } from '@/store/authStore';
export type TFunc = ReturnType<typeof useTranslation>['t'];
export type Stats = MarketStats;
export interface UniverseStats {
  total: number;
  updated_at: string;
  stats: { total: number; stocks: number; etfs: number; indices: number; us: number; cn: number };
}
export const MAX_POLL = 60;
export const INITIAL_TIMEOUT_MS = 15_000;
export const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
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
  if (count <= 1) return t('dataEngine.connecting');
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
  }
}
async function createPoll(ctx: Omit<PollCtx, 'poll'>): Promise<void> {
  const poll = async () => {
    const fullCtx: PollCtx = { ...ctx, poll };
    try {
      const statsUrl = ctx.force
        ? '/api/v1/data/manage/stats?force=1'
        : '/api/v1/data/manage/stats';
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
      reportError(e, { component: 'DataEngine', action: 'fetchStats' });
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
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
) {
  setActionMsg(`${label}...`);
  try {
    const res = await apiFetch(url, { method });
    const json = await res.json();
    setActionMsg(json.success ? `${label} ✓` : t('common.error'));
  } catch {
    setActionMsg(t('common.error'));
  }
  setTimeout(() => setActionMsg(''), 5000);
}
type ActionMethod = 'POST' | 'PUT' | 'PATCH';
function effectiveRole(user: { role: string; orgRole: string | null }): string {
  if (user.orgRole) {
    return user.orgRole === 'owner' ? 'admin' : user.orgRole;
  }
  return user.role;
}
function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4 text-caption text-fg-tertiary">
      {t('dataEngine.universeLastRefresh')}:{' '}
      {universe.updated_at
        ? new Date(universe.updated_at).toLocaleString('zh-CN')
        : t('dataEngine.notRefreshed')}
      {' | '}
      <span className="font-mono tabular-nums">{fmt(universe.total)}</span>{' '}
      {t('dataEngine.totalTickers')}
      {' | '}
      {t('dataEngine.stock')}{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.stocks || 0)}</span> + ETF{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.etfs || 0)}</span> +{' '}
      {t('dataEngine.index')}{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.indices || 0)}</span>
      {' | '}
      {t('dataEngine.usStocks')}{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.us || 0)}</span> +{' '}
      {t('dataEngine.cnStocks')}{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.cn || 0)}</span>
    </Card>
  );
}
function DataEngineActionButtons({
  actionMsg,
  fetchStats,
  doAction,
}: {
  actionMsg: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string, method: ActionMethod) => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const role = user ? effectiveRole(user) : '';
  const canManage = user?.platformAdmin === true || role === 'admin' || role === 'analyst';
  if (!canManage) return null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => fetchStats(true)}>
          <RefreshCw className="size-3.5" /> {t('dataEngine.refreshStats')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/update/inc', t('dataEngine.incrementalUpdate'), 'PATCH')
          }
        >
          <Play className="size-3.5" /> {t('dataEngine.incrementalUpdate')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/update/refetch', t('dataEngine.refetch'), 'PUT')
          }
        >
          <RotateCcw className="size-3.5" /> {t('dataEngine.refetch')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/update/full', t('dataEngine.fullUpdate'), 'PUT')
          }
        >
          <Zap className="size-3.5" /> {t('dataEngine.fullUpdate')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/universe', t('dataEngine.refreshUniverse'), 'PUT')
          }
        >
          <Database className="size-3.5" /> {t('dataEngine.refreshUniverse')}
        </Button>
        {actionMsg && <span className="text-caption font-semibold text-brand">{actionMsg}</span>}
      </div>
    </Card>
  );
}
export function DataEngineDashboard({
  stats,
  universe,
  actionMsg,
  fetchStats,
  doAction,
}: {
  stats: Stats;
  universe: UniverseStats | null;
  actionMsg: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string, method: ActionMethod) => void;
}) {
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
function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-brand">
        {icon}
        <span className="text-caption font-semibold text-fg-tertiary">{label}</span>
      </div>
      <div className="font-mono text-h1 font-bold leading-tight tabular-nums text-fg">{value}</div>
      <div className="mt-1 text-caption text-fg-tertiary">{sub}</div>
    </Card>
  );
}
function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  const pctVal = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-caption">
        <span className="text-fg-secondary">{label}</span>
        <span className="font-mono tabular-nums text-fg-tertiary">
          {(current ?? 0).toLocaleString()} / {(total ?? 0).toLocaleString()} ({pctVal.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-input-bg">
        <div
          className="h-full rounded bg-brand transition-[width] duration-500"
          style={{ width: `${pctVal}%` }}
        />
      </div>
    </div>
  );
}
export function DataEngineOverviewCards({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  const totalUniverse = universe?.total || stats.total_cached || 0;
  const totalCached = stats.total_cached || 0;
  const coverageBase = totalUniverse > 0 ? totalUniverse : totalCached;
  const earliestDate = stats.date_ranges.earliest;
  const latestDate = stats.date_ranges.latest;
  const historyYears = historySpanYears(earliestDate, latestDate);
  const timeRangeSub =
    historyYears != null && earliestDate
      ? t('dataEngine.deepHistoryHighlight', {
          year: earliestDate.slice(0, 4),
          years: historyYears,
        })
      : `${t('dataEngine.to')} ${latestDate || '-'}`;
  return (
    <div className="my-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      <StatCard
        icon={<Database className="size-5" />}
        label={t('dataEngine.universeLabel')}
        value={fmt(totalUniverse)}
        sub={`${t('dataEngine.cached')} ${fmt(totalCached)} (${coverageBase > 0 ? ((totalCached / coverageBase) * 100).toFixed(1) : 0}%)`}
      />
      <StatCard
        icon={<BarChart3 className="size-5" />}
        label={t('dataEngine.totalDataPoints')}
        value={fmt(stats.data_quality.total_data_points || 0)}
        sub={`${t('dataEngine.avgPointsPerTicker')} ${fmt(stats.coverage.avg_data_points || 0)}`}
      />
      <StatCard
        icon={<Clock className="size-5" />}
        label={t('dataEngine.timeRange')}
        value={earliestDate || '-'}
        sub={timeRangeSub}
      />
      <StatCard
        icon={<HardDrive className="size-5" />}
        label={t('dataEngine.diskUsage')}
        value={formatStorageMb(stats.data_quality.total_size_mb || 0)}
        sub={t('dataEngine.dbStorageSub')}
      />
    </div>
  );
}
export function DataEngineCoverageBars({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  const totalUniverse = universe?.total || stats.total_cached || 0;
  const totalCached = stats.total_cached || 0;
  const coverageBase = totalUniverse > 0 ? totalUniverse : totalCached;
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.dataCoverage')}</div>
      <ProgressBar
        label={t('dataEngine.totalCoverage')}
        current={totalCached}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.fiveYearsPlus')}
        current={stats.coverage.tickers_with_5y_plus || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.tenYearsPlus')}
        current={stats.coverage.tickers_with_10y_plus || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.twentyYearsPlus')}
        current={stats.coverage.tickers_with_20y_plus || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.adjCloseData')}
        current={stats.data_quality.with_adj_close || 0}
        total={coverageBase}
      />
    </Card>
  );
}
const BAR_FILL = '#3b82f6'; // Blue-500 from PORTFOLIO_COLORS
const AXIS_TICK_COLOR = 'var(--text-muted)';
function ageBucketSortValue(bucket: string): number {
  const match = bucket.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 999;
}
const DECADE_ORDER = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
function sortAgeBucketEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => ageBucketSortValue(a[0]) - ageBucketSortValue(b[0]));
}
function sortDecadeEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => {
    const ai = DECADE_ORDER.indexOf(a[0]);
    const bi = DECADE_ORDER.indexOf(b[0]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 overflow-hidden rounded bg-input-bg">
      <div
        className="h-full rounded bg-brand transition-[width] duration-400"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
function DistributionRow({
  label,
  count,
  maxCount,
  bold = false,
}: {
  label: string;
  count: number;
  maxCount: number;
  bold?: boolean;
}) {
  const barPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="mb-1.5">
      <div className="mb-0.75 flex justify-between text-label">
        <span className={`text-fg-secondary ${bold ? 'font-semibold' : ''}`}>{label}</span>
        <span className="font-mono tabular-nums text-fg-tertiary">{fmt(count)}</span>
      </div>
      <MiniBar pct={barPct} />
    </div>
  );
}
export function MarketDistributionCard({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  const marketEntries = stats.by_market ? Object.entries(stats.by_market) : [];
  const maxCount =
    marketEntries.length > 0 ? Math.max(...marketEntries.map(([, d]) => d.count)) : 0;
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.byMarket')}</div>
      {marketEntries.map(([market, data]) => {
        const label =
          market === 'US'
            ? t('dataEngine.usStock')
            : market === 'CN'
              ? t('dataEngine.cnStock')
              : market;
        return (
          <div key={market} className="mb-2.5">
            <div className="mb-0.75 flex justify-between text-label">
              <span className="font-semibold text-fg-secondary">{label}</span>
              <span className="font-mono tabular-nums text-fg-tertiary">{fmt(data.count)}</span>
            </div>
            <MiniBar pct={maxCount > 0 ? (data.count / maxCount) * 100 : 0} />
            <div className="mt-[3px] flex gap-3 text-caption text-fg-tertiary">
              <span>
                {t('dataEngine.stock')} {data.stocks}
              </span>
              <span>
                {t('dataEngine.etf')} {data.etfs}
              </span>
              {data.indices > 0 && (
                <span>
                  {t('dataEngine.index')} {data.indices}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {universe?.stats && (universe.stats.us != null || universe.stats.cn != null) && (
        <div className="mt-3 border-t border-subtle pt-3 text-caption text-fg-tertiary">
          <div className="mb-1 font-semibold">{t('dataEngine.universeVsCache')}</div>
          <div>
            {t('dataEngine.usStocks')}: {fmt(universe.stats.us)} → {t('dataEngine.cached')}{' '}
            {fmt(stats.by_market?.US?.count)}
          </div>
          <div>
            {t('dataEngine.cnStocks')}: {fmt(universe.stats.cn)} → {t('dataEngine.cached')}{' '}
            {fmt(stats.by_market?.CN?.count)}
          </div>
        </div>
      )}
    </Card>
  );
}
export function ExchangeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const exchangeEntries = stats.by_exchange
    ? Object.entries(stats.by_exchange)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(0, 10)
    : [];
  const maxCount = exchangeEntries.length > 0 ? Math.max(...exchangeEntries.map(([, c]) => c)) : 0;
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.byExchange')}</div>
      {exchangeEntries.map(([exchange, count]) => (
        <DistributionRow
          key={exchange}
          label={exchange || t('dataEngine.unknown')}
          count={count}
          maxCount={maxCount}
        />
      ))}
    </Card>
  );
}
export function DecadeDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_decade ? sortDecadeEntries(Object.entries(stats.by_decade)) : [];
  return <DistributionBarCard titleKey="dataEngine.byDecade" entries={entries} />;
}
export function YearCountDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_year_count
    ? sortAgeBucketEntries(Object.entries(stats.by_year_count))
    : [];
  return <DistributionBarCard titleKey="dataEngine.byYearCount" entries={entries} />;
}
interface DistributionBarCardProps {
  titleKey: string;
  entries: [string, number][];
}
function DistributionBarCard({ titleKey, entries }: DistributionBarCardProps) {
  const { t } = useTranslation();
  const data = entries.map(([bucket, count]) => ({ bucket, count }));
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t(titleKey)}</div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-soft)' }}
              interval={0}
              angle={entries.length > 8 ? -35 : 0}
              textAnchor={entries.length > 8 ? 'end' : 'middle'}
              height={entries.length > 8 ? 50 : 30}
            />
            <YAxis hide />
            <RechartsBar dataKey="count" fill={BAR_FILL} radius={[3, 3, 0, 0]} maxBarSize={60}>
              <LabelList
                dataKey="count"
                position="top"
                style={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'monospace' }}
                formatter={(v: number) => fmt(v)}
              />
              {data.map((entry) => (
                <Cell key={entry.bucket} fill={BAR_FILL} />
              ))}
            </RechartsBar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
interface RecentUpdate {
  ticker: string;
  name: string;
  lastBarDate: string | null;
  updatedAt: string | null;
}
export function RecentUpdatesCard() {
  const { t } = useTranslation();
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/data/recent-updates?limit=10')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setUpdates((json?.data ?? []) as RecentUpdate[]);
      })
      .catch(() => {
        if (!cancelled) setUpdates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Card className="p-4" data-testid="recent-updates-card">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.recentUpdates')}</div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-input-bg animate-pulse rounded" />
          ))}
        </div>
      ) : updates.length === 0 ? (
        <div className="text-caption text-fg-tertiary text-center py-6">
          {t('dataEngine.noRecentUpdates')}
        </div>
      ) : (
        <div className="space-y-1">
          {updates.map((u) => (
            <div
              key={u.ticker}
              className="flex items-center gap-3 py-[3px] text-caption"
              data-testid={`recent-update-${u.ticker}`}
            >
              <span className="font-mono text-fg w-20 flex-shrink-0">{u.ticker}</span>
              <span className="text-fg-secondary truncate flex-1">{u.name}</span>
              <span className="font-mono tabular-nums text-fg-tertiary">
                {u.lastBarDate ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
export function SampleTickersCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const categoryLabels: Record<string, string> = {
    us_stock: t('dataEngine.usStockCategory'),
    us_etf: t('dataEngine.usEtfCategory'),
    cn_stock: t('dataEngine.cnStockCategory'),
    cn_etf: t('dataEngine.cnEtfCategory'),
    index: t('dataEngine.indexCategory'),
  };
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.sampleTickers')}</div>
      {stats.sample_tickers &&
        Object.entries(stats.sample_tickers).map(
          ([category, items]) =>
            items.length > 0 && (
              <div key={category} className="mb-3">
                <div className="mb-1 text-caption font-semibold text-brand">
                  {categoryLabels[category] || category}
                </div>
                {items.map((tk) => (
                  <div
                    key={tk.ticker}
                    className="flex justify-between py-0.5 text-caption text-fg-secondary"
                  >
                    <span className="font-medium">{tk.ticker}</span>
                    <span className="text-fg-tertiary">
                      {tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}
                      {t('common.days')})
                    </span>
                  </div>
                ))}
              </div>
            ),
        )}
    </Card>
  );
}
function Bar({ width, height = 10 }: { width: string; height?: string | number }) {
  return <Skeleton style={{ width, height }} />;
}
function ActionButtonsSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} width="120px" height={36} />
        ))}
      </div>
    </Card>
  );
}
function OverviewCardsSkeleton() {
  return (
    <div className="my-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Bar width="20px" height={20} />
            <Bar width="80px" height={12} />
          </div>
          <Bar width="60%" height={24} />
          <div className="mt-2">
            <Bar width="90%" height={12} />
          </div>
        </Card>
      ))}
    </div>
  );
}
function CoverageBarsSkeleton() {
  return (
    <Card className="p-4">
      <Bar width="160px" height={14} />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="mb-1 flex justify-between">
              <Bar width="30%" height={10} />
              <Bar width="20%" height={10} />
            </div>
            <Bar width="100%" height={8} />
          </div>
        ))}
      </div>
    </Card>
  );
}
function DistributionCardSkeleton() {
  return (
    <Card className="p-4">
      <Bar width="50%" height={14} />
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Bar width="16px" height={16} />
            <Bar width="40%" height={10} />
            <Bar width="20%" height={10} />
          </div>
        ))}
      </div>
    </Card>
  );
}
function SampleTickersSkeleton() {
  return (
    <Card className="p-4">
      <Bar width="40%" height={14} />
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Bar width="30%" height={12} />
            <Bar width="25%" height={12} />
          </div>
        ))}
      </div>
    </Card>
  );
}
export function DataEngineSkeleton() {
  return (
    <>
      <ActionButtonsSkeleton />
      <OverviewCardsSkeleton />
      <CoverageBarsSkeleton />
      <div className="my-2 grid grid-cols-2 gap-3">
        <DistributionCardSkeleton />
        <DistributionCardSkeleton />
      </div>
      <Card className="p-4">
        <Bar width="40%" height={14} />
        <div className="mt-4 flex h-44 items-end gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Bar key={i} width="100%" height={`${30 + ((i * 13) % 60)}%`} />
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <Bar width="40%" height={14} />
        <div className="mt-4 flex h-40 items-end gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <Bar key={i} width="100%" height={`${20 + ((i * 17) % 70)}%`} />
          ))}
        </div>
      </Card>
      <div className="my-2 grid grid-cols-2 gap-3">
        <SampleTickersSkeleton />
        <SampleTickersSkeleton />
      </div>
    </>
  );
}
