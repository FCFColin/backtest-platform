/**
 * @file 数据引擎页面
 * @description 展示底层数据引擎的缓存统计、市场分布、数据质量及覆盖范围等元信息
 * @route /data-engine
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  RefreshCw,
  Play,
  Zap,
  BarChart3,
  Clock,
  HardDrive,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { useToastStore } from '../store/toastStore';

const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
const pct = (n: number | undefined | null, total: number) => {
  const val = n ?? 0;
  return total > 0 ? `${((val / total) * 100).toFixed(1)}%` : '0%';
};

/** 将 MB 格式化为可读存储大小 */
function formatStorageMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

/** 计算 earliest→latest 跨越年数（用于强调历史深度） */
function historySpanYears(earliest?: string | null, latest?: string | null): number | null {
  if (!earliest || !latest) return null;
  const y0 = parseInt(earliest.slice(0, 4), 10);
  const y1 = parseInt(latest.slice(0, 4), 10);
  if (Number.isNaN(y0) || Number.isNaN(y1) || y1 < y0) return null;
  return y1 - y0;
}

interface Stats {
  generated_at: string;
  total_cached: number;
  by_market: Record<string, { count: number; stocks: number; etfs: number; indices: number }>;
  by_type: Record<string, number>;
  by_exchange: Record<string, number>;
  date_ranges: { earliest: string | null; latest: string | null };
  by_decade: Record<string, number>;
  by_year_count: Record<string, number>;
  coverage: {
    tickers_with_5y_plus: number;
    tickers_with_10y_plus: number;
    tickers_with_20y_plus: number;
    avg_data_points: number;
    median_data_points: number;
  };
  data_quality: {
    with_adj_close: number;
    with_dividends: number;
    with_splits: number;
    total_data_points: number;
    total_size_mb: number;
  };
  recent_updates: Array<{ ticker: string; name: string; updated: string }>;
  sample_tickers: Record<
    string,
    Array<{
      ticker: string;
      name: string;
      first_date: string;
      last_date: string;
      data_points: number;
    }>
  >;
}

interface UniverseStats {
  total: number;
  updated_at: string;
  stats: { total: number; stocks: number; etfs: number; indices: number; us: number; cn: number };
}

const MAX_POLL = 60;
const INITIAL_TIMEOUT_MS = 15_000;

type TFunc = ReturnType<typeof useTranslation>['t'];

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
  if (json?.errorType === 'scan_failed') return `${t('dataEngine.scanFailed')}：${json.error || t('dataEngine.unknown')}`;
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
      ctx.setScanning(false); ctx.setLoading(false); ctx.setError(ctx.t('dataEngine.loadTimeout'));
      return;
    }
    setTimeout(ctx.poll, 2000);
  } else {
    ctx.setStats((data?.stats ?? null) as Stats | null);
    ctx.setUniverse((data?.universe ?? null) as UniverseStats | null);
    ctx.setScanning(false); ctx.setLoadStage(ctx.t('dataEngine.ready')); ctx.setLoading(false);
    console.debug(`[DataEnginePage] fetchStats 总耗时 ${Date.now() - ctx.t0}ms (pollCount=${ctx.pollCountRef.current})`);
  }
}

async function createPoll(ctx: Omit<PollCtx, 'poll'>): Promise<void> {
  const poll = async () => {
    const fullCtx: PollCtx = { ...ctx, poll };
    try {
      const statsUrl = ctx.force ? '/api/data/manage/stats?force=1' : '/api/data/manage/stats';
      const res = await apiFetch(statsUrl);
      if (ctx.pollCountRef.current === 0 && Date.now() - ctx.fetchStartRef.current > INITIAL_TIMEOUT_MS) {
        ctx.setLoading(false); ctx.setError(ctx.t('dataEngine.connectionTimeout'));
        return;
      }
      let json: Record<string, unknown> | null = null;
      try { json = await res.json(); } catch {
        ctx.setLoading(false); ctx.setError(ctx.t('dataEngine.serverAbnormal'));
        return;
      }
      if (json && json.success) handlePollSuccess(fullCtx, json);
      else { ctx.setLoading(false); ctx.setError(classifyError(ctx.t, res, json)); }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
      useToastStore.getState().addToast('error', ctx.t('dataEngine.statsLoadFailed'));
      ctx.setLoading(false);
      ctx.setError(e instanceof TypeError && e.message.includes('fetch') ? ctx.t('dataEngine.networkError') : ctx.t('dataEngine.loadFailed'));
    }
  };
  await poll();
}

async function doFetchStats(
  t: TFunc, force: boolean,
  refs: { pollCountRef: React.MutableRefObject<number>; fetchStartRef: React.MutableRefObject<number> },
  setters: { setStats: (v: Stats | null) => void; setUniverse: (v: UniverseStats | null) => void; setLoading: (v: boolean) => void; setError: (v: string) => void; setLoadStage: (v: string) => void; setScanning: (v: boolean) => void },
) {
  const t0 = Date.now();
  refs.fetchStartRef.current = t0;
  setters.setLoading(true); setters.setError(''); setters.setLoadStage(t('dataEngine.connecting')); refs.pollCountRef.current = 0;
  await createPoll({ t, force, t0, pollCountRef: refs.pollCountRef, fetchStartRef: refs.fetchStartRef, ...setters });
}

async function doActionFn(t: TFunc, url: string, label: string, setActionMsg: (v: string) => void) {
  setActionMsg(`${label}...`);
  try {
    const res = await apiFetch(url, { method: 'POST' });
    const json = await res.json();
    setActionMsg(json.success ? `${label} ✓` : t('common.error'));
  } catch { setActionMsg(t('common.error')); }
  setTimeout(() => setActionMsg(''), 5000);
}

function useDataEngineState() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [universe, setUniverse] = useState<UniverseStats | null>(null);
  const [, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');
  const [loadStage, setLoadStage] = useState(t('dataEngine.connecting'));
  const [, setScanning] = useState(false);
  const pollCountRef = useRef(0);
  const fetchStartRef = useRef(0);

  const fetchStats = (force = false) => doFetchStats(t, force, { pollCountRef, fetchStartRef }, { setStats, setUniverse, setLoading, setError, setLoadStage, setScanning });

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时执行一次初始化加载
  }, []);

  const doAction = (url: string, label: string) => doActionFn(t, url, label, setActionMsg);

  return { stats, universe, actionMsg, error, loadStage, fetchStats, doAction };
}

function DataEngineLoading({ error, loadStage, onRetry }: { error: string; loadStage: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('dataEngine.title')}</h1>
      </div>
      <div className="bt-main-card card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        {error ? (
          <>
            <div style={{ marginBottom: 12, color: 'var(--danger)', fontSize: 14, lineHeight: 1.6 }}>{error}</div>
            <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 18px', textTransform: 'none' }} onClick={onRetry}>
              <RotateCcw className="w-3.5 h-3.5" /> {t('common.retry')}
            </button>
          </>
        ) : (
          <>
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            {loadStage}
          </>
        )}
      </div>
    </div>
  );
}

function DataEngineActions({ actionMsg, onRefresh, onAction }: { actionMsg: string; onRefresh: () => void; onAction: (url: string, label: string) => void }) {
  const { t } = useTranslation();
  const btnBase = { fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none' } as const;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="main-action-btn" style={btnBase} onClick={onRefresh}>
          <RefreshCw className="w-3.5 h-3.5" /> {t('dataEngine.refreshStats')}
        </button>
        <button className="main-action-btn" style={{ ...btnBase, background: 'var(--support)' }} onClick={() => onAction('/api/data/manage/update/inc', t('dataEngine.incrementalUpdate'))}>
          <Play className="w-3.5 h-3.5" /> {t('dataEngine.incrementalUpdate')}
        </button>
        <button className="main-action-btn" style={{ ...btnBase, background: '#6366f1' }} onClick={() => onAction('/api/data/manage/update/refetch', t('dataEngine.refetch'))}>
          <RotateCcw className="w-3.5 h-3.5" /> {t('dataEngine.refetch')}
        </button>
        <button className="main-action-btn" style={{ ...btnBase, background: 'var(--warning)' }} onClick={() => onAction('/api/data/manage/update/full', t('dataEngine.fullUpdate'))}>
          <Zap className="w-3.5 h-3.5" /> {t('dataEngine.fullUpdate')}
        </button>
        <button className="main-action-btn" style={{ ...btnBase, background: 'var(--text-muted)' }} onClick={() => onAction('/api/data/manage/universe', t('dataEngine.refreshUniverse'))}>
          <Database className="w-3.5 h-3.5" /> {t('dataEngine.refreshUniverse')}
        </button>
        {actionMsg && <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{actionMsg}</span>}
      </div>
    </div>
  );
}

function DataEngineOverviewCards({ stats, universe }: { stats: Stats; universe: UniverseStats | null }) {
  const { t } = useTranslation();
  const totalUniverse = universe?.total || stats.total_cached || 0;
  const totalCached = stats.total_cached || 0;
  const coverageBase = totalUniverse > 0 ? totalUniverse : totalCached;
  const earliestDate = stats.date_ranges.earliest;
  const latestDate = stats.date_ranges.latest;
  const historyYears = historySpanYears(earliestDate, latestDate);
  const timeRangeSub = historyYears != null && earliestDate
    ? t('dataEngine.deepHistoryHighlight', { year: earliestDate.slice(0, 4), years: historyYears })
    : `${t('dataEngine.to')} ${latestDate || '—'}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: '8px 0' }}>
      <StatCard icon={<Database className="w-5 h-5" />} label={t('dataEngine.universeLabel')} value={fmt(totalUniverse)} sub={`${t('dataEngine.cached')} ${fmt(totalCached)} (${coverageBase > 0 ? ((totalCached / coverageBase) * 100).toFixed(1) : 0}%)`} />
      <StatCard icon={<BarChart3 className="w-5 h-5" />} label={t('dataEngine.totalDataPoints')} value={fmt(stats.data_quality.total_data_points || 0)} sub={`${t('dataEngine.avgPointsPerTicker')} ${fmt(stats.coverage.avg_data_points || 0)}`} />
      <StatCard icon={<Clock className="w-5 h-5" />} label={t('dataEngine.timeRange')} value={earliestDate || '—'} sub={timeRangeSub} />
      <StatCard icon={<HardDrive className="w-5 h-5" />} label={t('dataEngine.diskUsage')} value={formatStorageMb(stats.data_quality.total_size_mb || 0)} sub={t('dataEngine.dbStorageSub')} />
    </div>
  );
}

function DataEngineCoverageBars({ stats, universe }: { stats: Stats; universe: UniverseStats | null }) {
  const { t } = useTranslation();
  const totalUniverse = universe?.total || stats.total_cached || 0;
  const totalCached = stats.total_cached || 0;
  const coverageBase = totalUniverse > 0 ? totalUniverse : totalCached;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.dataCoverage')}</div>
      <ProgressBar label={t('dataEngine.totalCoverage')} current={totalCached} total={coverageBase} />
      <ProgressBar label={t('dataEngine.fiveYearsPlus')} current={stats.coverage.tickers_with_5y_plus || 0} total={coverageBase} />
      <ProgressBar label={t('dataEngine.tenYearsPlus')} current={stats.coverage.tickers_with_10y_plus || 0} total={coverageBase} />
      <ProgressBar label={t('dataEngine.twentyYearsPlus')} current={stats.coverage.tickers_with_20y_plus || 0} total={coverageBase} />
      <ProgressBar label={t('dataEngine.adjCloseData')} current={stats.data_quality.with_adj_close || 0} total={coverageBase} />
      <ProgressBar label={t('dataEngine.dividendData')} current={stats.data_quality.with_dividends || 0} total={coverageBase} />
    </div>
  );
}

function MarketDistributionCard({ stats, universe }: { stats: Stats; universe: UniverseStats | null }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byMarket')}</div>
      {stats.by_market && Object.entries(stats.by_market).map(([market, data]) => (
        <div key={market} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{market === 'US' ? t('dataEngine.usStock') : market === 'CN' ? t('dataEngine.cnStock') : market}</span>
            <span style={{ color: 'var(--text-muted)' }}>{fmt(data.count)}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
            <span>{t('dataEngine.stock')} {data.stocks}</span>
            <span>{t('dataEngine.etf')} {data.etfs}</span>
            {data.indices > 0 && <span>{t('dataEngine.index')} {data.indices}</span>}
          </div>
        </div>
      ))}
      {universe?.stats && (universe.stats.us != null || universe.stats.cn != null) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)', fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('dataEngine.universeVsCache')}</div>
          <div>{t('dataEngine.usStocks')}: {fmt(universe.stats.us)} → {t('dataEngine.cached')} {fmt(stats.by_market?.US?.count)}</div>
          <div>{t('dataEngine.cnStocks')}: {fmt(universe.stats.cn)} → {t('dataEngine.cached')} {fmt(stats.by_market?.CN?.count)}</div>
        </div>
      )}
    </div>
  );
}

function ExchangeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byExchange')}</div>
      {stats.by_exchange && Object.entries(stats.by_exchange).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([exchange, count]) => (
        <div key={exchange} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
          <span style={{ color: 'var(--text-body)' }}>{exchange || t('dataEngine.unknown')}</span>
          <span style={{ color: 'var(--text-muted)' }}>{fmt(count)}</span>
        </div>
      ))}
    </div>
  );
}

function DecadeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byDecade')}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {stats.by_decade && Object.entries(stats.by_decade).sort((a, b) => a[0].localeCompare(b[0])).map(([decade, count]) => {
          const maxCount = Math.max(...Object.values(stats.by_decade));
          const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={decade} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{fmt(count)}</span>
              <div style={{ width: '100%', maxWidth: 60, height: `${Math.max(heightPct, 2)}%`, background: 'var(--brand-soft)', border: '1px solid var(--brand)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' }}>{decade}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearCountDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byYearCount')}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
        {stats.by_year_count && Object.entries(stats.by_year_count).sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, count]) => {
          const maxCount = Math.max(...Object.values(stats.by_year_count));
          const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={bucket} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{fmt(count)}</span>
              <div style={{ width: '100%', maxWidth: 50, height: `${Math.max(heightPct, 2)}%`, background: 'var(--support-soft)', border: '1px solid var(--support)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' }}>{bucket}</span>
            </div>
          );
        })}
      </div>
    </div>
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
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.sampleTickers')}</div>
      {stats.sample_tickers && Object.entries(stats.sample_tickers).map(([category, items]) => items.length > 0 && (
        <div key={category} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)', marginBottom: 4 }}>{categoryLabels[category] || category}</div>
          {items.map((tk) => (
            <div key={tk.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-body)', padding: '2px 0' }}>
              <span style={{ fontWeight: 500 }}>{tk.ticker}</span>
              <span style={{ color: 'var(--text-muted)' }}>{tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}{t('common.days')})</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RecentUpdatesCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.recentUpdates')}</div>
      {stats.recent_updates?.slice(0, 15).map((upd) => (
        <div key={upd.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px dashed var(--border-soft)' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-body)' }}>{upd.ticker}</span>
          <span style={{ color: 'var(--text-muted)' }}>{upd.updated.replace('T', ' ').slice(0, 19)}</span>
        </div>
      ))}
    </div>
  );
}

function DataQualityCard({ stats, universe }: { stats: Stats; universe: UniverseStats | null }) {
  const { t } = useTranslation();
  const totalCached = stats.total_cached || 0;
  const totalUniverse = universe?.total || totalCached;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.dataQuality')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <QualityItem icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />} label={t('dataEngine.adjClosePrice')} value={pct(stats.data_quality.with_adj_close || 0, totalUniverse)} />
        <QualityItem icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />} label={t('dataEngine.dividendData')} value={pct(stats.data_quality.with_dividends || 0, totalCached)} />
        <QualityItem icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />} label={t('dataEngine.withSplits')} value={pct(stats.data_quality.with_splits || 0, totalCached)} />
        <QualityItem icon={<BarChart3 className="w-4 h-4" style={{ color: 'var(--brand)' }} />} label={t('dataEngine.medianDataPoints')} value={fmt(stats.coverage.median_data_points || 0)} />
      </div>
    </div>
  );
}

function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card" style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
      {t('dataEngine.universeLastRefresh')}: {universe.updated_at ? new Date(universe.updated_at).toLocaleString('zh-CN') : t('dataEngine.notRefreshed')}
      {' | '}{fmt(universe.total)} {t('dataEngine.totalTickers')}
      {' | '}{t('dataEngine.stock')} {fmt(universe.stats?.stocks || 0)} + ETF {fmt(universe.stats?.etfs || 0)} + {t('dataEngine.index')} {fmt(universe.stats?.indices || 0)}
      {' | '}{t('dataEngine.usStocks')} {fmt(universe.stats?.us || 0)} + {t('dataEngine.cnStocks')} {fmt(universe.stats?.cn || 0)}
    </div>
  );
}

export default function DataEnginePage() {
  const { t } = useTranslation();
  const { stats, universe, actionMsg, error, loadStage, fetchStats, doAction } = useDataEngineState();

  if (!stats) return <DataEngineLoading error={error} loadStage={loadStage} onRetry={() => fetchStats(true)} />;

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('dataEngine.title')}</h1>
      </div>
      <DataEngineActions actionMsg={actionMsg} onRefresh={() => fetchStats(true)} onAction={doAction} />
      <DataEngineOverviewCards stats={stats} universe={universe} />
      <DataEngineCoverageBars stats={stats} universe={universe} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
        <MarketDistributionCard stats={stats} universe={universe} />
        <ExchangeDistributionCard stats={stats} />
      </div>
      <DecadeDistributionCard stats={stats} />
      <YearCountDistributionCard stats={stats} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
        <SampleTickersCard stats={stats} />
        <RecentUpdatesCard stats={stats} />
      </div>
      <DataQualityCard stats={stats} universe={universe} />
      {universe && <UniverseInfo universe={universe} />}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand)', marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  const pctVal = total > 0 ? (current / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-body)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{fmt(current)} / {fmt(total)} ({pctVal.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pctVal}%`, background: pctVal >= 80 ? 'var(--success)' : pctVal >= 40 ? 'var(--brand)' : 'var(--warning)', borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function QualityItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>{value}</div>
      </div>
    </div>
  );
}
