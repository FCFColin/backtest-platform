import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Server, RefreshCw, Clock, HardDrive } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient.js';
import { usePolling } from '../../hooks/miscHooks.js';
import { useToastStore } from '../../store/toastStore.js';
import { reportError } from '../../utils/errorReporter.js';
import { KpiCard, ServiceStatusBadge } from '../../components/admin/AdminLayout.js';
import { Button, Card, Progress } from '../../components/ui/uiComponents.js';
interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  version?: string;
  message?: string;
}
interface SystemResource {
  memoryMB: number;
  heapUsedMB: number;
  uptime: string;
  uptimeSeconds: number;
}
interface DataDirectory {
  totalSizeMB: number;
  tickerCount: number;
  totalDataPoints: number;
}
interface MonitorData {
  services: ServiceHealth[];
  system: SystemResource;
  dataDir: DataDirectory;
}
const defaultMonitorData: MonitorData = {
  services: [
    { name: 'adminPage.dashboard.goEngine', status: 'down', latency: 0 },
    { name: 'adminPage.dashboard.goDataService', status: 'down', latency: 0 },
    { name: 'adminPage.dashboard.nodeService', status: 'down', latency: 0 },
  ],
  system: { memoryMB: 0, heapUsedMB: 0, uptime: '-', uptimeSeconds: 0 },
  dataDir: { totalSizeMB: 0, tickerCount: 0, totalDataPoints: 0 },
};
function buildServiceHealth(
  name: string,
  raw: { status?: string; latency_ms?: number; version?: string; error?: string } | undefined,
  fallbackDown = true,
): ServiceHealth {
  return raw
    ? {
        name,
        status: raw.status === 'healthy' ? 'healthy' : 'down',
        latency: raw.latency_ms || 0,
        version: raw.version,
        message: raw.error,
      }
    : { name, status: fallbackDown ? 'down' : 'healthy', latency: 0 };
}
async function fetchServices(): Promise<ServiceHealth[]> {
  const res = await apiFetch('/api/v1/admin/stats');
  if (!res.ok) return defaultMonitorData.services;
  const json = await res.json();
  if (!json.success || !json.data) return defaultMonitorData.services;
  const s = json.data.services;
  return [
    buildServiceHealth('adminPage.dashboard.goEngine', s?.go_engine),
    buildServiceHealth('adminPage.dashboard.goDataService', s?.go_data_service),
    buildServiceHealth('adminPage.dashboard.nodeService', undefined, false),
  ];
}
function buildMonitorData(d: Record<string, unknown>, services: ServiceHealth[]): MonitorData {
  const mem = d.memory as Record<string, number> | undefined;
  const up = d.uptime as Record<string, unknown> | undefined;
  const dd = d.data_directory as Record<string, number> | undefined;
  return {
    services,
    system: {
      memoryMB: mem?.rss_mb || 0,
      heapUsedMB: mem?.heap_used_mb || 0,
      uptime: (up?.formatted as string) || '-',
      uptimeSeconds: (up?.seconds as number) || 0,
    },
    dataDir: {
      totalSizeMB: dd?.total_size_mb || 0,
      tickerCount: dd?.ticker_file_count || 0,
      totalDataPoints: dd?.total_data_points || 0,
    },
  };
}
// eslint-disable-next-line max-lines-per-function
export default function SystemMonitor() {
  const { t } = useTranslation();
  const [data, setData] = useState<MonitorData>(defaultMonitorData);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');
  const fetchMonitorData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/admin/system');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;
      setData(buildMonitorData(json.data, await fetchServices()));
    } catch (error) {
      reportError(error, { component: 'SystemMonitor', action: 'fetchMonitorData' });
      useToastStore.getState().addToast('error', t('Load failed'));
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString('zh-CN'));
  };
  usePolling(fetchMonitorData, 10000, { enabled: autoRefresh, deps: [autoRefresh] });
  const memBars = [
    {
      label: t('RSS Memory'),
      valueMB: data.system.memoryMB,
      totalMB: data.system.memoryMB,
    },
    {
      label: t('Heap Used'),
      valueMB: data.system.heapUsedMB,
      totalMB: data.system.memoryMB,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={fetchMonitorData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </Button>
          <label className="flex items-center gap-2 text-sm text-fg-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t('Auto Refresh')}
          </label>
        </div>
        <div className="text-xs text-fg-tertiary">
          {lastRefresh ? t('Last Update: {{time}}', { time: lastRefresh }) : t('Not Refreshed')}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('Node Memory')}
          value={`${data.system.memoryMB} MB`}
          subtitle={t('Heap Usage: {{heap}} MB', { heap: data.system.heapUsedMB })}
          icon={<HardDrive className="h-5 w-5" />}
          color="blue"
        />
        <KpiCard
          label={t('Uptime')}
          value={data.system.uptime}
          icon={<Clock className="h-5 w-5" />}
          color="green"
        />
        <KpiCard
          label={t('Data Directory')}
          value={`${(data.dataDir.totalSizeMB / 1024).toFixed(1)} GB`}
          subtitle={t('Ticker Count: {{count}}', { count: data.dataDir.tickerCount })}
          icon={<Activity className="h-5 w-5" />}
          color="purple"
        />
      </div>
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-fg">{t('Service Health')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.services.map((service) => (
            <Card key={service.name} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-fg-tertiary" />
                  <span className="font-medium text-fg-secondary">{t(service.name)}</span>
                </div>
                <ServiceStatusBadge status={service.status} variant="pill" size="sm" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-tertiary">{t('Latency')}</span>
                  <span className="font-medium text-fg-secondary">{service.latency}ms</span>
                </div>
                {service.version && (
                  <div className="flex justify-between">
                    <span className="text-fg-tertiary">{t('Version')}</span>
                    <span className="font-medium text-fg-secondary">{service.version}</span>
                  </div>
                )}
                {service.message && (
                  <div className="mt-2 rounded bg-elevated p-2">
                    <p className="text-xs text-fg-tertiary">{service.message}</p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-fg">{t('Memory Usage')}</h2>
        <div className="space-y-4">
          {memBars.map((bar) => {
            const pct = bar.totalMB > 0 ? Math.min((bar.valueMB / bar.totalMB) * 100, 100) : 0;
            return (
              <div key={bar.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-fg-secondary">{bar.label}</span>
                  <span className="font-medium text-fg">{bar.valueMB} MB</span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle p-3">
            <p className="text-xs text-fg-tertiary">{t('Total Data Points')}</p>
            <p className="text-lg font-bold text-fg">
              {data.dataDir.totalDataPoints > 0
                ? `${(data.dataDir.totalDataPoints / 1000000).toFixed(1)}M`
                : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-border-subtle p-3">
            <p className="text-xs text-fg-tertiary">{t('Ticker File Count')}</p>
            <p className="text-lg font-bold text-fg">{data.dataDir.tickerCount.toLocaleString()}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
