/* eslint-disable react-refresh/only-export-components -- 导出共享工具常量，Plan-1 拆分 */
import * as React from 'react';
import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, Zap, Database, BarChart3, Clock, HardDrive } from 'lucide-react';
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
const MAX_POLL = 60;
const INITIAL_TIMEOUT_MS = 15_000;
const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
const formatStorageMb = (mb: number): string =>
  mb >= 1024
    ? `${(mb / 1024).toFixed(2)} GB`
    : mb >= 100
      ? `${Math.round(mb)} MB`
      : `${mb.toFixed(1)} MB`;
const historySpanYears = (earliest?: string | null, latest?: string | null): number | null => {
  if (!earliest || !latest) return null;
  const y0 = parseInt(earliest.slice(0, 4), 10);
  const y1 = parseInt(latest.slice(0, 4), 10);
  if (Number.isNaN(y0) || Number.isNaN(y1) || y1 < y0) return null;
  return y1 - y0;
};
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
  if (status === 401 || status === 403) return t('dataEngine.authFailed');
  if (json?.errorType === 'scan_failed')
    return `${t('dataEngine.scanFailed')}：${json.error || t('dataEngine.unknown')}`;
  if (res.status >= 500) return t('dataEngine.serverError');
  return t('dataEngine.loadFailed');
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
  setters.setLoadStage(t('dataEngine.connecting'));
  // eslint-disable-next-line complexity -- 轮询状态机分支多，Plan-1 已拆分，保留可读性
  const poll = async (): Promise<void> => {
    let json: Record<string, unknown> | null = null;
    try {
      const res = await apiFetch(
        force ? '/api/v1/data/manage/stats?force=1' : '/api/v1/data/manage/stats',
      );
      if (refs.pollCountRef.current === 0 && Date.now() - t0 > INITIAL_TIMEOUT_MS) {
        setters.setLoading(false);
        setters.setError(t('dataEngine.connectionTimeout'));
        return;
      }
      json = await res.json().catch(() => null);
      if (json === null) {
        setters.setLoading(false);
        setters.setError(t('dataEngine.serverAbnormal'));
        return;
      }
      if (!json.success) {
        setters.setLoading(false);
        setters.setError(classifyError(t, res, json));
        return;
      }
      const data = json.data as Record<string, unknown> | undefined;
      if (data?.scanning) {
        setters.setScanning(true);
        refs.pollCountRef.current += 1;
        setters.setLoadStage(getLoadStage(t, refs.pollCountRef.current));
        if (refs.pollCountRef.current >= MAX_POLL) {
          setters.setScanning(false);
          setters.setLoading(false);
          setters.setError(t('dataEngine.loadTimeout'));
          return;
        }
        setTimeout(poll, 2000);
      } else {
        setters.setStats((data?.stats ?? null) as Stats | null);
        setters.setUniverse((data?.universe ?? null) as UniverseStats | null);
        setters.setScanning(false);
        setters.setLoadStage(t('dataEngine.ready'));
        setters.setLoading(false);
      }
    } catch (e) {
      reportError(e, { component: 'DataEngine', action: 'fetchStats' });
      useToastStore.getState().addToast('error', t('dataEngine.statsLoadFailed'));
      setters.setLoading(false);
      setters.setError(
        e instanceof TypeError && e.message.includes('fetch')
          ? t('dataEngine.networkError')
          : t('dataEngine.loadFailed'),
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
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
): Promise<void> {
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
const effectiveRole = (user: { role: string; orgRole: string | null }): string => {
  if (user.orgRole) return user.orgRole === 'owner' ? 'admin' : user.orgRole;
  return user.role;
};
function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  const u = universe;
  return (
    <Card className="p-4 text-caption text-fg-tertiary">
      {t('dataEngine.universeLastRefresh')}:{' '}
      {u.updated_at ? new Date(u.updated_at).toLocaleString('zh-CN') : t('dataEngine.notRefreshed')}
      {' | '}
      <span className="font-mono tabular-nums">{fmt(u.total)}</span> {t('dataEngine.totalTickers')}{' '}
      |{' '}
      <span>
        {t('dataEngine.stock')}{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.stocks || 0)}</span> + ETF{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.etfs || 0)}</span> +{' '}
        {t('dataEngine.index')}{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.indices || 0)}</span>
      </span>{' '}
      |{' '}
      <span>
        {t('dataEngine.usStocks')}{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.us || 0)}</span> +{' '}
        {t('dataEngine.cnStocks')}{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.cn || 0)}</span>
      </span>
    </Card>
  );
}
const MANAGE_ACTIONS: Array<{
  url: string;
  labelKey: string;
  method: ActionMethod;
  icon: ReactNode;
}> = [
  {
    url: '/api/v1/data/manage/update/inc',
    labelKey: 'incrementalUpdate',
    method: 'PATCH',
    icon: <Play className="size-3.5" />,
  },
  {
    url: '/api/v1/data/manage/update/full',
    labelKey: 'fullUpdate',
    method: 'PUT',
    icon: <Zap className="size-3.5" />,
  },
  {
    url: '/api/v1/data/manage/universe',
    labelKey: 'refreshUniverse',
    method: 'PUT',
    icon: <Database className="size-3.5" />,
  },
];
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
        {MANAGE_ACTIONS.map((a) => (
          <Button
            key={a.url}
            variant="secondary"
            size="sm"
            onClick={() => doAction(a.url, t(`dataEngine.${a.labelKey}`), a.method)}
          >
            {a.icon} {t(`dataEngine.${a.labelKey}`)}
          </Button>
        ))}
        {actionMsg && <span className="text-caption font-semibold text-brand">{actionMsg}</span>}
      </div>
    </Card>
  );
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
function DataEngineOverviewCards({
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
  const cards = [
    {
      icon: <Database className="size-5" />,
      label: t('dataEngine.universeLabel'),
      value: fmt(totalUniverse),
      sub: `${t('dataEngine.cached')} ${fmt(totalCached)} (${coverageBase > 0 ? ((totalCached / coverageBase) * 100).toFixed(1) : 0}%)`,
    },
    {
      icon: <BarChart3 className="size-5" />,
      label: t('dataEngine.totalDataPoints'),
      value: fmt(stats.data_quality.total_data_points || 0),
      sub: `${t('dataEngine.avgPointsPerTicker')} ${fmt(stats.coverage.avg_data_points || 0)}`,
    },
    {
      icon: <Clock className="size-5" />,
      label: t('dataEngine.timeRange'),
      value: earliestDate || '-',
      sub:
        historyYears != null && earliestDate
          ? t('dataEngine.deepHistoryHighlight', {
              year: earliestDate.slice(0, 4),
              years: historyYears,
            })
          : `${t('dataEngine.to')} ${latestDate || '-'}`,
    },
    {
      icon: <HardDrive className="size-5" />,
      label: t('dataEngine.diskUsage'),
      value: formatStorageMb(stats.data_quality.total_size_mb || 0),
      sub: t('dataEngine.dbStorageSub'),
    },
  ];
  return (
    <div className="my-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
function DataEngineCoverageBars({
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
  const bars = [
    { label: t('dataEngine.totalCoverage'), current: totalCached },
    { label: t('dataEngine.fiveYearsPlus'), current: stats.coverage.tickers_with_5y_plus || 0 },
    { label: t('dataEngine.tenYearsPlus'), current: stats.coverage.tickers_with_10y_plus || 0 },
    { label: t('dataEngine.twentyYearsPlus'), current: stats.coverage.tickers_with_20y_plus || 0 },
    { label: t('dataEngine.adjCloseData'), current: stats.data_quality.with_adj_close || 0 },
  ];
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.dataCoverage')}</div>
      {bars.map((b) => (
        <ProgressBar key={b.label} label={b.label} current={b.current} total={coverageBase} />
      ))}
    </Card>
  );
}
const BAR_FILL = '#3b82f6'; // Blue-500 from PORTFOLIO_COLORS
const AXIS_TICK_COLOR = 'var(--text-muted)';
const DECADE_ORDER = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
function sortAgeBucketEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => {
    const am = a[0].match(/^(\d+)/);
    const bm = b[0].match(/^(\d+)/);
    return (am ? parseInt(am[1], 10) : 999) - (bm ? parseInt(bm[1], 10) : 999);
  });
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
function MarketDistributionCard({
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
  const labelOf = (market: string) =>
    market === 'US' ? t('dataEngine.usStock') : market === 'CN' ? t('dataEngine.cnStock') : market;
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.byMarket')}</div>
      {marketEntries.map(([market, data]) => (
        <div key={market} className="mb-2.5">
          <div className="mb-0.75 flex justify-between text-label">
            <span className="font-semibold text-fg-secondary">{labelOf(market)}</span>
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
      ))}
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
function ExchangeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const entries = stats.by_exchange
    ? Object.entries(stats.by_exchange)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(0, 10)
    : [];
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c)) : 0;
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.byExchange')}</div>
      {entries.map(([exchange, count]) => (
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
function DecadeDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_decade ? sortDecadeEntries(Object.entries(stats.by_decade)) : [];
  return <DistributionBarCard titleKey="dataEngine.byDecade" entries={entries} />;
}
function YearCountDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_year_count
    ? sortAgeBucketEntries(Object.entries(stats.by_year_count))
    : [];
  return <DistributionBarCard titleKey="dataEngine.byYearCount" entries={entries} />;
}
function DistributionBarCard({
  titleKey,
  entries,
}: {
  titleKey: string;
  entries: [string, number][];
}) {
  const { t } = useTranslation();
  const data = entries.map(([bucket, count]) => ({ bucket, count }));
  const rotate = entries.length > 8;
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
              angle={rotate ? -35 : 0}
              textAnchor={rotate ? 'end' : 'middle'}
              height={rotate ? 50 : 30}
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
function RecentUpdatesCard() {
  const { t } = useTranslation();
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/data/recent-updates?limit=10')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setUpdates((json?.data ?? []) as RecentUpdate[]);
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
function SampleTickersCard({ stats }: { stats: Stats }) {
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
interface SkeletonRow {
  bars: Array<{ w: string; h: string | number }>;
  rowClass?: string;
}
const rowsOf = (
  n: number,
  rowClass: string,
  bars: Array<{ w: string; h: string | number }>,
): SkeletonRow[] => Array.from({ length: n }, () => ({ rowClass, bars }));
function SkeletonRowsCard({
  titleW,
  rows,
  wrapperClass = 'mt-4 flex flex-col gap-2.5',
}: {
  titleW: string;
  rows: SkeletonRow[];
  wrapperClass?: string;
}) {
  return (
    <Card className="p-4">
      <Bar width={titleW} height={14} />
      <div className={wrapperClass}>
        {rows.map((row, i) => (
          <div key={i} className={row.rowClass}>
            {row.bars.map((b, j) => (
              <Bar key={j} width={b.w} height={b.h} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
const COVERAGE_SKELETON_ROWS: SkeletonRow[] = Array.from({ length: 12 }, (_, i) =>
  i % 2 === 0
    ? {
        rowClass: 'mb-1 flex justify-between',
        bars: [
          { w: '30%', h: 10 },
          { w: '20%', h: 10 },
        ],
      }
    : { bars: [{ w: '100%', h: 8 }] },
);
function HistogramSkeleton({
  barClass,
  n,
  pct,
}: {
  barClass: string;
  n: number;
  pct: (i: number) => string;
}) {
  return (
    <Card className="p-4">
      <Bar width="40%" height={14} />
      <div className={`mt-4 flex items-end ${barClass}`}>
        {Array.from({ length: n }).map((_, i) => (
          <Bar key={i} width="100%" height={pct(i)} />
        ))}
      </div>
    </Card>
  );
}
export function DataEngineSkeleton() {
  const distRows = rowsOf(5, 'flex items-center gap-2', [
    { w: '16px', h: 16 },
    { w: '40%', h: 10 },
    { w: '20%', h: 10 },
  ]);
  const sampleRows = rowsOf(6, 'flex justify-between', [
    { w: '30%', h: 12 },
    { w: '25%', h: 12 },
  ]);
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} width="120px" height={36} />
          ))}
        </div>
      </Card>
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
      <SkeletonRowsCard titleW="160px" rows={COVERAGE_SKELETON_ROWS} />
      <div className="my-2 grid grid-cols-2 gap-3">
        <SkeletonRowsCard titleW="50%" wrapperClass="mt-4 flex flex-col gap-2" rows={distRows} />
        <SkeletonRowsCard titleW="50%" wrapperClass="mt-4 flex flex-col gap-2" rows={distRows} />
      </div>
      <HistogramSkeleton barClass="h-44 gap-1.5" n={10} pct={(i) => `${30 + ((i * 13) % 60)}%`} />
      <HistogramSkeleton barClass="h-40 gap-1" n={12} pct={(i) => `${20 + ((i * 17) % 70)}%`} />
      <div className="my-2 grid grid-cols-2 gap-3">
        <SkeletonRowsCard titleW="40%" wrapperClass="mt-4 flex flex-col gap-2" rows={sampleRows} />
        <SkeletonRowsCard titleW="40%" wrapperClass="mt-4 flex flex-col gap-2" rows={sampleRows} />
      </div>
    </>
  );
}
