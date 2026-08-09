import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  RefreshCw,
  Play,
  Zap,
  HardDrive,
  Calendar,
  BarChart3,
  Globe,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch } from '../../utils/apiClient.js';
import { useToastStore } from '../../store/toastStore.js';
import { reportError } from '../../utils/errorReporter.js';
import { parseMarketBreakdown } from '../../utils/adminStats.js';
import { KpiCard, ServiceStatusBadge } from '../../components/admin/AdminLayout.js';
import { Button, Card } from '../../components/ui/uiComponents.js';

interface DataSource {
  name: string;
  type: 'api' | 'local';
  status: 'active' | 'inactive' | 'unknown';
  recordCount: number;
  lastUpdated: string;
}
interface DataStats {
  totalTickers: number;
  totalDataPoints: number;
  dateRange: { earliest: string; latest: string };
  totalSizeMB: number;
  marketBreakdown: Record<string, number>;
}

const TABLE_COLS = ['Data Source', 'Type', 'Status', 'Record Count', 'Last Updated'];
const defaultDataSources: DataSource[] = (
  [
    ['Go Data Service', 'api'],
    ['Local Cache', 'local'],
  ] as const
).map(([name, type]) => ({
  name,
  type,
  status: 'unknown' as const,
  recordCount: 0,
  lastUpdated: '-',
}));
const defaultDataStats: DataStats = {
  totalTickers: 0,
  totalDataPoints: 0,
  dateRange: { earliest: '-', latest: '-' },
  totalSizeMB: 0,
  marketBreakdown: {},
};
const getYearDiff = (start: string, end: string) =>
  Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );

function buildDataStats(d: Record<string, unknown>): DataStats {
  const s = d.stats as Record<string, unknown> | undefined;
  const u = d.universe as Record<string, unknown> | undefined;
  const dq = s?.data_quality as Record<string, number> | undefined;
  const dateRanges = (s?.date_ranges as { earliest: string; latest: string }) || {
    earliest: '-',
    latest: '-',
  };
  return {
    totalTickers: (u?.total as number) || 0,
    totalDataPoints: dq?.total_data_points || 0,
    totalSizeMB: dq?.total_size_mb || 0,
    dateRange: dateRanges,
    marketBreakdown: parseMarketBreakdown(s?.by_market as Record<string, unknown> | undefined),
  };
}
function buildSources(stats: DataStats): DataSource[] {
  const latest = stats.dateRange.latest || '-';
  const upd = (i: number, patch: Partial<DataSource>) => ({
    ...defaultDataSources[i],
    ...patch,
    lastUpdated: latest,
  });
  return [
    upd(0, { status: 'active', recordCount: stats.totalDataPoints }),
    upd(1, {
      status: stats.totalTickers > 0 ? 'active' : 'inactive',
      recordCount: stats.totalTickers,
    }),
  ];
}

function ActionBar({
  loading,
  actionMsg,
  onRefresh,
  onAction,
}: {
  loading: boolean;
  actionMsg: string;
  onRefresh: () => void;
  onAction: (url: string, method: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const actions = [
    {
      url: '/api/v1/data/manage/update/inc',
      method: 'PATCH',
      label: t('Incremental Update'),
      icon: Play,
      cls: 'bg-success hover:bg-success/90',
    },
    {
      url: '/api/v1/data/manage/update/full',
      method: 'PUT',
      label: t('Full Update'),
      icon: Zap,
      cls: 'bg-brand text-brand-fg hover:bg-brand-hover',
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {t('Refresh Stats')}
      </Button>
      {actions.map((a) => (
        <button
          key={a.url}
          onClick={() => onAction(a.url, a.method, a.label)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${a.cls}`}
        >
          <a.icon className="h-4 w-4" /> {a.label}
        </button>
      ))}
      {actionMsg && <span className="text-sm font-medium text-brand">{actionMsg}</span>}
    </div>
  );
}

function DataSourceTable({ sources }: { sources: DataSource[] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="mb-4 text-sm font-semibold text-fg">{t('Data Source')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-tertiary">
              {TABLE_COLS.map((c) => (
                <th key={c} className="pb-2 font-medium">
                  {t(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const status =
                source.status === 'active'
                  ? 'healthy'
                  : source.status === 'inactive'
                    ? 'down'
                    : 'unknown';
              const last =
                typeof source.lastUpdated === 'string' && source.lastUpdated.includes('T')
                  ? source.lastUpdated.replace('T', ' ').slice(0, 19)
                  : source.lastUpdated;
              return (
                <tr key={source.name} className="border-b border-border-subtle last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {source.type === 'api' ? (
                        <Globe className="h-4 w-4 text-brand" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-success" />
                      )}
                      <span className="font-medium text-fg-secondary">{t(source.name)}</span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-fg-secondary">
                      {t(source.type === 'api' ? 'API' : 'Local')}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <ServiceStatusBadge status={status} />
                  </td>
                  <td className="py-2.5 text-fg-tertiary">
                    {source.recordCount > 0 ? source.recordCount.toLocaleString() : '-'}
                  </td>
                  <td className="py-2.5 text-fg-tertiary">{last}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MarketAndDateSection({ stats }: { stats: DataStats }) {
  const { t } = useTranslation();
  return (
    <>
      {Object.keys(stats.marketBreakdown).length > 0 && (
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-fg">{t('Market Ticker Count')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(stats.marketBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([market, count]) => (
                <div key={market} className="rounded-lg border border-border-subtle p-3">
                  <p className="text-xs font-medium text-fg-tertiary">{market}</p>
                  <p className="text-lg font-bold text-fg">{count.toLocaleString()}</p>
                </div>
              ))}
          </div>
        </Card>
      )}
      {stats.dateRange.earliest !== '-' && (
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-fg">{t('Data Coverage Range')}</h2>
          <div className="mb-1 flex justify-between text-xs text-fg-tertiary">
            <span>{stats.dateRange.earliest}</span>
            <span>{stats.dateRange.latest}</span>
          </div>
          <p className="text-xs text-fg-tertiary">
            {t('Covers {{years}} years', {
              years: getYearDiff(stats.dateRange.earliest, stats.dateRange.latest),
            })}
          </p>
        </Card>
      )}
    </>
  );
}

function StatsGrid({ stats }: { stats: DataStats }) {
  const { t } = useTranslation();
  const items = [
    {
      label: t('Total Tickers'),
      value: stats.totalTickers.toLocaleString(),
      icon: <BarChart3 className="h-5 w-5" />,
      color: 'blue' as const,
    },
    {
      label: t('Total Data Points'),
      value: stats.totalDataPoints > 0 ? `${(stats.totalDataPoints / 1000000).toFixed(1)}M` : '-',
      icon: <Database className="h-5 w-5" />,
      color: 'green' as const,
    },
    {
      label: t('Data Coverage'),
      value:
        stats.dateRange.earliest !== '-'
          ? `${stats.dateRange.earliest} ~ ${stats.dateRange.latest}`
          : '-',
      icon: <Calendar className="h-5 w-5" />,
      color: 'purple' as const,
    },
    {
      label: t('Database Size'),
      value: stats.totalSizeMB > 0 ? `${(stats.totalSizeMB / 1024).toFixed(1)} GB` : '-',
      icon: <HardDrive className="h-5 w-5" />,
      color: 'orange' as const,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <KpiCard key={it.label} label={it.label} value={it.value} icon={it.icon} color={it.color} />
      ))}
    </div>
  );
}

export default function DataManagement() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<DataSource[]>(defaultDataSources);
  const [stats, setStats] = useState<DataStats>(defaultDataStats);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      [actionTimerRef, refetchTimerRef].forEach((r) => r.current && clearTimeout(r.current));
    },
    [],
  );
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/data/manage/stats');
      const json = await res.json();
      if (json.success && json.data) {
        const newStats = buildDataStats(json.data);
        setStats(newStats);
        setSources(buildSources(newStats));
      }
    } catch (e) {
      reportError(e, { component: 'DataManagement', action: 'fetchData' });
      useToastStore.getState().addToast('error', t('Failed to load statistics'));
    }
    try {
      const goRes = await apiFetch('/api/v1/data/health');
      const goOk = goRes.ok;
      const goSource = (s: DataSource): DataSource =>
        goOk
          ? { ...s, status: 'active', lastUpdated: new Date().toISOString().slice(0, 19) }
          : { ...s, status: 'inactive' };
      setSources((prev) => prev.map((s, i) => (i === 0 ? goSource(s) : s)));
    } catch {
      setSources((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: 'inactive' } : s)));
    }
    setLoading(false);
  }, [t]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const doAction = async (url: string, method: string, label: string) => {
    setActionMsg(t('{{label}} in progress...', { label }));
    try {
      const res = await apiFetch(url, { method });
      const json = await res.json();
      setActionMsg(
        json.success
          ? t('{{label}} triggered', { label })
          : t('Action failed: {{error}}', { error: json.error }),
      );
      if (json.success) refetchTimerRef.current = setTimeout(fetchData, 2000);
    } catch {
      setActionMsg(t('{{label}} request failed', { label }));
    }
    actionTimerRef.current = setTimeout(() => setActionMsg(''), 5000);
  };
  return (
    <div className="space-y-6">
      <ActionBar
        loading={loading}
        actionMsg={actionMsg}
        onRefresh={fetchData}
        onAction={doAction}
      />
      <StatsGrid stats={stats} />
      <DataSourceTable sources={sources} />
      <MarketAndDateSection stats={stats} />
    </div>
  );
}
