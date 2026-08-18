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
import { useConfirmDialog } from '../../components/confirmDialog.js';

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
const defaultSources: DataSource[] = (
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
const defaultStats: DataStats = {
  totalTickers: 0,
  totalDataPoints: 0,
  dateRange: { earliest: '-', latest: '-' },
  totalSizeMB: 0,
  marketBreakdown: {},
};
const yearDiff = (s: string, e: string) =>
  Math.round((new Date(e).getTime() - new Date(s).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

function buildDataStats(d: Record<string, unknown>): DataStats {
  const s = d.stats as Record<string, unknown> | undefined;
  const u = d.universe as Record<string, unknown> | undefined;
  return {
    totalTickers: (u?.total as number) || 0,
    totalDataPoints:
      (s?.data_quality as Record<string, number> | undefined)?.total_data_points || 0,
    totalSizeMB: (s?.data_quality as Record<string, number> | undefined)?.total_size_mb || 0,
    dateRange: (s?.date_ranges as { earliest: string; latest: string }) || {
      earliest: '-',
      latest: '-',
    },
    marketBreakdown: parseMarketBreakdown(s?.by_market as Record<string, unknown> | undefined),
  };
}

function buildSources(st: DataStats): DataSource[] {
  const latest = st.dateRange.latest || '-';
  const upd = (i: number, patch: Partial<DataSource>) => ({
    ...defaultSources[i],
    ...patch,
    lastUpdated: latest,
  });
  return [
    upd(0, { status: 'active', recordCount: st.totalDataPoints }),
    upd(1, { status: st.totalTickers > 0 ? 'active' : 'inactive', recordCount: st.totalTickers }),
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
  const [confirmDialog, confirmAction] = useConfirmDialog();
  const actions = [
    {
      url: '/api/v1/data/manage/update/inc',
      method: 'PATCH',
      label: t('Incremental Update'),
      icon: Play,
      variant: 'success' as const,
    },
    {
      url: '/api/v1/data/manage/update/full',
      method: 'PUT',
      label: t('Full Update'),
      icon: Zap,
      variant: 'primary' as const,
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {t('Refresh Stats')}
      </Button>
      {actions.map((a) => (
        <Button
          key={a.url}
          variant={a.variant === 'success' ? 'secondary' : 'primary'}
          className={
            a.variant === 'success'
              ? 'text-success border-success/25 bg-success/15 hover:bg-success/25 hover:text-success'
              : undefined
          }
          onClick={() =>
            a.method === 'PUT'
              ? confirmAction(
                  t('Full update refetches all market data. Continue?'),
                  () => onAction(a.url, a.method, a.label),
                  true,
                )
              : onAction(a.url, a.method, a.label)
          }
        >
          <a.icon className="h-4 w-4" /> {a.label}
        </Button>
      ))}
      {actionMsg && <span className="text-sm font-medium text-brand">{actionMsg}</span>}
      {confirmDialog}
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
                <th key={c} scope="col" className="pb-2 font-medium">
                  {t(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((src) => {
              const st =
                src.status === 'active'
                  ? 'healthy'
                  : src.status === 'inactive'
                    ? 'down'
                    : 'unknown';
              const last =
                typeof src.lastUpdated === 'string' && src.lastUpdated.includes('T')
                  ? src.lastUpdated.replace('T', ' ').slice(0, 19)
                  : src.lastUpdated;
              return (
                <tr key={src.name} className="border-b border-border-subtle last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {src.type === 'api' ? (
                        <Globe className="h-4 w-4 text-brand" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-success" />
                      )}
                      <span className="font-medium text-fg-secondary">{t(src.name)}</span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-fg-secondary">
                      {t(src.type === 'api' ? 'API' : 'Local')}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <ServiceStatusBadge status={st} />
                  </td>
                  <td className="py-2.5 text-fg-tertiary">
                    {src.recordCount > 0 ? src.recordCount.toLocaleString() : '-'}
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
  const mkt = Object.keys(stats.marketBreakdown).length > 0;
  const hasDate = stats.dateRange.earliest !== '-';
  return (
    <>
      {mkt && (
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
      {hasDate && (
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-fg">{t('Data Coverage Range')}</h2>
          <div className="mb-1 flex justify-between text-xs text-fg-tertiary">
            <span>{stats.dateRange.earliest}</span>
            <span>{stats.dateRange.latest}</span>
          </div>
          <p className="text-xs text-fg-tertiary">
            {t('Covers {{years}} years', {
              years: yearDiff(stats.dateRange.earliest, stats.dateRange.latest),
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
      value: stats.totalDataPoints > 0 ? `${(stats.totalDataPoints / 1e6).toFixed(1)}M` : '-',
      icon: <Database className="h-5 w-5" />,
      color: 'green' as const,
    },
    {
      label: t('Data Coverage'),
      value:
        stats.dateRange.earliest !== '-'
          ? `${stats.dateRange.earliest.slice(0, 4)} ~ ${stats.dateRange.latest.slice(0, 4)}`
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
  const [sources, setSources] = useState<DataSource[]>(defaultSources);
  const [stats, setStats] = useState<DataStats>(defaultStats);
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
      const json = await (await apiFetch('/api/v1/data/manage/stats')).json();
      if (json.success && json.data) {
        const ns = buildDataStats(json.data);
        setStats(ns);
        setSources(buildSources(ns));
      }
    } catch (e) {
      reportError(e, { component: 'DataManagement', action: 'fetchData' });
      useToastStore.getState().addToast('error', t('Failed to load statistics'));
    }
    try {
      const goOk = (await apiFetch('/api/v1/data/health')).ok;
      const patch = (s: DataSource): DataSource =>
        goOk
          ? { ...s, status: 'active', lastUpdated: new Date().toISOString().slice(0, 19) }
          : { ...s, status: 'inactive' };
      setSources((prev) => prev.map((s, i) => (i === 0 ? patch(s) : s)));
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
      const json = await (await apiFetch(url, { method })).json();
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
