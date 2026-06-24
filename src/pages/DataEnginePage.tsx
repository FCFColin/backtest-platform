/**
 * @file 数据引擎页面
 * @description 展示底层数据引擎的缓存统计、市场分布、数据质量及覆盖范围等元信息
 * @route /data-engine
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, RefreshCw, Play, Zap, BarChart3, Clock, HardDrive, CheckCircle, RotateCcw } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { useToastStore } from '../store/toastStore';

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

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
  sample_tickers: Record<string, Array<{ ticker: string; name: string; first_date: string; last_date: string; data_points: number }>>;
}

interface UniverseStats {
  total: number;
  updated_at: string;
  stats: { total: number; stocks: number; etfs: number; indices: number; us: number; cn: number };
}

export default function DataEnginePage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [universe, setUniverse] = useState<UniverseStats | null>(null);
  const [, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');
  const [loadStage, setLoadStage] = useState(t('dataEngine.connecting'));

  const [, setScanning] = useState(false);
  const pollCountRef = useRef(0);
  const MAX_POLL = 60;
  const INITIAL_TIMEOUT_MS = 15_000; // 首次响应超时 15 秒
  const fetchStartRef = useRef(0);

  const getLoadStage = (count: number): string => {
    if (count <= 3) return t('dataEngine.connecting');
    if (count <= 10) return t('dataEngine.scanningFiles');
    if (count <= 30) return t('dataEngine.countingTickers');
    if (count <= 50) return t('dataEngine.generatingReport');
    return t('dataEngine.almostReady');
  };

  /** 根据 HTTP 状态码和响应体判断错误类型 */
  const classifyError = (res: Response, json: Record<string, unknown> | null): string => {
    if (res.status === 401 || res.status === 403) {
      return t('dataEngine.authFailed');
    }
    if (json?.errorType === 'scan_failed') {
      return `${t('dataEngine.scanFailed')}：${json.error || t('dataEngine.unknown')}`;
    }
    if (res.status >= 500) {
      return t('dataEngine.serverError');
    }
    return t('dataEngine.loadFailed');
  };

  const fetchStats = async () => {
    const t0 = Date.now();
    fetchStartRef.current = t0;
    setLoading(true);
    setError('');
    setLoadStage(t('dataEngine.connecting'));
    pollCountRef.current = 0;

    const poll = async () => {
      try {
        const res = await apiFetch('/api/data/manage/stats');

        // 首次响应超时检测：如果首次请求就花了超过 15 秒，提示超时
        if (pollCountRef.current === 0 && (Date.now() - fetchStartRef.current > INITIAL_TIMEOUT_MS)) {
          setLoading(false);
          setError(t('dataEngine.connectionTimeout'));
          return;
        }

        let json: Record<string, unknown> | null = null;
        try {
          json = await res.json();
        } catch {
          // 响应体非 JSON（如代理 502 页面）
          setLoading(false);
          setError(t('dataEngine.serverAbnormal'));
          return;
        }

        if (json && json.success) {
          const data = json.data as Record<string, unknown> | undefined;
          if (data?.scanning) {
            setScanning(true);
            pollCountRef.current += 1;
            setLoadStage(getLoadStage(pollCountRef.current));
            if (pollCountRef.current >= MAX_POLL) {
              setScanning(false);
              setLoading(false);
              setError(t('dataEngine.loadTimeout'));
              return;
            }
            setTimeout(poll, 2000);
          } else {
            setStats((data?.stats ?? null) as Stats | null);
            setUniverse((data?.universe ?? null) as UniverseStats | null);
            setScanning(false);
            setLoadStage(t('dataEngine.ready'));
            setLoading(false);
            console.debug(`[DataEnginePage] fetchStats 总耗时 ${Date.now() - t0}ms (pollCount=${pollCountRef.current})`);
          }
        } else {
          setLoading(false);
          setError(classifyError(res, json));
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e);
        useToastStore.getState().addToast('error', t('dataEngine.statsLoadFailed'));
        setLoading(false);
        if (e instanceof TypeError && e.message.includes('fetch')) {
          setError(t('dataEngine.networkError'));
        } else {
          setError(t('dataEngine.loadFailed'));
        }
      }
    };

    await poll();
  };

  useEffect(() => { fetchStats(); }, []);

  const doAction = async (url: string, label: string) => {
    setActionMsg(`${label}...`);
    try {
      const res = await apiFetch(url, { method: 'POST' });
      const json = await res.json();
      setActionMsg(json.success ? `${label} ✓` : t('common.error'));
    } catch {
      setActionMsg(t('common.error'));
    }
    setTimeout(() => setActionMsg(''), 5000);
  };

  if (!stats) {
    return (
      <div className="bt-page">
        <div className="bt-page-header"><h1 className="bt-page-title">{t('dataEngine.title')}</h1></div>
        <div className="bt-main-card card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {error ? (
            <>
              <div style={{ marginBottom: 12, color: 'var(--danger)', fontSize: 14, lineHeight: 1.6 }}>{error}</div>
              <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 18px', textTransform: 'none' }} onClick={() => fetchStats()}>
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

  const totalUniverse = universe?.total || 0;
  const totalCached = stats?.total_cached || 0;

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('dataEngine.title')}</h1>
      </div>

      {/* 操作按钮 */}
      <div className="bt-main-card card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none' }} onClick={() => fetchStats()}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('dataEngine.refreshStats')}
          </button>
          <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none', background: 'var(--support)' }} onClick={() => doAction('/api/data/manage/update/inc', t('dataEngine.incrementalUpdate'))}>
            <Play className="w-3.5 h-3.5" /> {t('dataEngine.incrementalUpdate')}
          </button>
          <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none', background: '#6366f1' }} onClick={() => doAction('/api/data/manage/update/refetch', t('dataEngine.refetch'))}>
            <RotateCcw className="w-3.5 h-3.5" /> {t('dataEngine.refetch')}
          </button>
          <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none', background: 'var(--warning)' }} onClick={() => doAction('/api/data/manage/update/full', t('dataEngine.fullUpdate'))}>
            <Zap className="w-3.5 h-3.5" /> {t('dataEngine.fullUpdate')}
          </button>
          <button className="main-action-btn" style={{ fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none', background: 'var(--text-muted)' }} onClick={() => doAction('/api/data/manage/universe', t('dataEngine.refreshUniverse'))}>
            <Database className="w-3.5 h-3.5" /> {t('dataEngine.refreshUniverse')}
          </button>
          {actionMsg && <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{actionMsg}</span>}
        </div>
      </div>

      {/* 概览卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: '8px 0' }}>
        <StatCard icon={<Database className="w-5 h-5" />} label={t('dataEngine.universeLabel')} value={fmt(totalUniverse)} sub={`${t('dataEngine.cached')} ${fmt(totalCached)} (${totalUniverse > 0 ? ((totalCached / totalUniverse) * 100).toFixed(1) : 0}%)`} />
        <StatCard icon={<BarChart3 className="w-5 h-5" />} label={t('dataEngine.totalDataPoints')} value={fmt(stats?.data_quality.total_data_points || 0)} sub={`${t('dataEngine.avgPointsPerTicker')} ${fmt(stats?.coverage.avg_data_points || 0)}`} />
        <StatCard icon={<Clock className="w-5 h-5" />} label={t('dataEngine.timeRange')} value={stats?.date_ranges.earliest || '—'} sub={`${t('dataEngine.to')} ${stats?.date_ranges.latest || '—'}`} />
        <StatCard icon={<HardDrive className="w-5 h-5" />} label={t('dataEngine.diskUsage')} value={`${stats?.data_quality.total_size_mb || 0} MB`} sub={`${fmt(totalCached)} ${t('dataEngine.jsonFiles')}`} />
      </div>

      {/* 覆盖率进度条 */}
      <div className="bt-main-card card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.dataCoverage')}</div>
        <ProgressBar label={t('dataEngine.totalCoverage')} current={totalCached} total={totalUniverse} />
        <ProgressBar label={t('dataEngine.fiveYearsPlus')} current={stats?.coverage.tickers_with_5y_plus || 0} total={totalUniverse} />
        <ProgressBar label={t('dataEngine.tenYearsPlus')} current={stats?.coverage.tickers_with_10y_plus || 0} total={totalUniverse} />
        <ProgressBar label={t('dataEngine.twentyYearsPlus')} current={stats?.coverage.tickers_with_20y_plus || 0} total={totalUniverse} />
        <ProgressBar label={t('dataEngine.adjCloseData')} current={stats?.data_quality.with_adj_close || 0} total={totalUniverse} />
        <ProgressBar label={t('dataEngine.dividendData')} current={stats?.data_quality.with_dividends || 0} total={totalUniverse} />
      </div>

      {/* 按市场分布 + 交易所 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
        <div className="bt-main-card card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byMarket')}</div>
          {stats?.by_market && Object.entries(stats.by_market).map(([market, data]) => (
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
          {universe?.stats && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)', fontSize: 12, color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('dataEngine.universeVsCache')}</div>
              <div>{t('dataEngine.usStocks')}: {fmt(universe.stats.us)} → {t('dataEngine.cached')} {fmt(stats?.by_market?.US?.count || 0)}</div>
              <div>{t('dataEngine.cnStocks')}: {fmt(universe.stats.cn)} → {t('dataEngine.cached')} {fmt(stats?.by_market?.CN?.count || 0)}</div>
            </div>
          )}
        </div>

        <div className="bt-main-card card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byExchange')}</div>
          {stats?.by_exchange && Object.entries(stats.by_exchange)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([exchange, count]) => (
              <div key={exchange} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-body)' }}>{exchange || t('dataEngine.unknown')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{fmt(count)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* 按数据起始年代分布 */}
      <div className="bt-main-card card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byDecade')}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
          {stats?.by_decade && Object.entries(stats.by_decade)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([decade, count]) => {
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

      {/* 按数据年数分布 */}
      <div className="bt-main-card card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.byYearCount')}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
          {stats?.by_year_count && Object.entries(stats.by_year_count)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([bucket, count]) => {
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

      {/* 样本标的 & 最近更新 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
        <div className="bt-main-card card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.sampleTickers')}</div>
          {stats?.sample_tickers && Object.entries(stats.sample_tickers).map(([category, items]) => (
            items.length > 0 && (
              <div key={category} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)', marginBottom: 4 }}>
                  {{ us_stock: t('dataEngine.usStockCategory'), us_etf: t('dataEngine.usEtfCategory'), cn_stock: t('dataEngine.cnStockCategory'), cn_etf: t('dataEngine.cnEtfCategory'), index: t('dataEngine.indexCategory') }[category] || category}
                </div>
                {items.map((tk) => (
                  <div key={tk.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-body)', padding: '2px 0' }}>
                    <span style={{ fontWeight: 500 }}>{tk.ticker}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}{t('common.days')})</span>
                  </div>
                ))}
              </div>
            )
          ))}
        </div>

        <div className="bt-main-card card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.recentUpdates')}</div>
          {stats?.recent_updates?.slice(0, 15).map((upd) => (
            <div key={upd.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px dashed var(--border-soft)' }}>
              <span style={{ fontWeight: 500, color: 'var(--text-body)' }}>{upd.ticker}</span>
              <span style={{ color: 'var(--text-muted)' }}>{upd.updated.replace('T', ' ').slice(0, 19)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 数据质量 */}
      <div className="bt-main-card card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>{t('dataEngine.dataQuality')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <QualityItem icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />} label={t('dataEngine.adjClosePrice')} value={pct(stats?.data_quality.with_adj_close || 0, totalCached)} />
          <QualityItem icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />} label={t('dataEngine.dividendData')} value={pct(stats?.data_quality.with_dividends || 0, totalCached)} />
          <QualityItem icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />} label={t('dataEngine.withSplits')} value={pct(stats?.data_quality.with_splits || 0, totalCached)} />
          <QualityItem icon={<BarChart3 className="w-4 h-4" style={{ color: 'var(--brand)' }} />} label={t('dataEngine.medianDataPoints')} value={fmt(stats?.coverage.median_data_points || 0)} />
        </div>
      </div>

      {/* 宇宙信息 */}
      {universe && (
        <div className="bt-seo-card card" style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          {t('dataEngine.universeLastRefresh')}: {universe.updated_at ? new Date(universe.updated_at).toLocaleString('zh-CN') : t('dataEngine.notRefreshed')}
          {' | '}{fmt(universe.total)} {t('dataEngine.totalTickers')}
          {' | '}{t('dataEngine.stock')} {fmt(universe.stats?.stocks || 0)} + ETF {fmt(universe.stats?.etfs || 0)} + {t('dataEngine.index')} {fmt(universe.stats?.indices || 0)}
          {' | '}{t('dataEngine.usStocks')} {fmt(universe.stats?.us || 0)} + {t('dataEngine.cnStocks')} {fmt(universe.stats?.cn || 0)}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand)', marginBottom: 8 }}>{icon}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  const pctVal = total > 0 ? ((current / total) * 100) : 0;
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
