import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Server, RefreshCw, Clock, HardDrive } from 'lucide-react';
import { useAdminFetch, usePolling } from '../../hooks/miscHooks.js';
import { KpiCard, ServiceStatusBadge } from '../../components/admin/AdminLayout.js';
import { Button, Card, Progress } from '../../components/ui/uiComponents.js';
import { buildServiceHealths, type ServiceHealthView } from '../../utils/adminStats.js';
const defaultData = {
  services: buildServiceHealths({}),
  system: { memoryMB: 0, heapUsedMB: 0, heapTotalMB: 0, uptime: '-', uptimeSeconds: 0 },
  dataDir: { totalSizeMB: 0, tickerCount: 0, totalDataPoints: 0 },
};
function buildData(d: Record<string, unknown>, services: ServiceHealthView[]) {
  const mem = d.memory as Record<string, number> | undefined;
  const up = d.uptime as Record<string, unknown> | undefined;
  const dd = d.data_directory as Record<string, number> | undefined;
  return {
    services,
    system: {
      memoryMB: mem?.rss_mb || 0,
      heapUsedMB: mem?.heap_used_mb || 0,
      heapTotalMB: mem?.heap_total_mb || 0,
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
export default function SystemMonitor() {
  const { t } = useTranslation();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const {
    data,
    loading,
    lastRefresh,
    fetch: refresh,
  } = useAdminFetch(
    '/api/v1/admin/system',
    (d) => buildData(d, buildServiceHealths(d)),
    defaultData,
    'SystemMonitor',
  );
  usePolling(refresh, 10000, { enabled: autoRefresh, deps: [autoRefresh] });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={refresh} disabled={loading}>
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
          {data.services.map((svc) => (
            <Card key={svc.name} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-fg-tertiary" />
                  <span className="font-medium text-fg-secondary">{t(svc.name)}</span>
                </div>
                <ServiceStatusBadge status={svc.status} variant="pill" size="sm" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-tertiary">{t('Latency')}</span>
                  <span className="font-medium text-fg-secondary">{svc.latency}ms</span>
                </div>
                {svc.version && (
                  <div className="flex justify-between">
                    <span className="text-fg-tertiary">{t('Version')}</span>
                    <span className="font-medium text-fg-secondary">{svc.version}</span>
                  </div>
                )}
                {svc.message && (
                  <div className="mt-2 rounded bg-elevated p-2">
                    <p className="text-xs text-fg-tertiary">{svc.message}</p>
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
          {(() => {
            const pct =
              data.system.heapTotalMB > 0
                ? Math.min((data.system.heapUsedMB / data.system.heapTotalMB) * 100, 100)
                : 0;
            return (
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-fg-secondary">{t('Heap Used')}</span>
                  <span className="font-medium text-fg">{data.system.heapUsedMB} MB</span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })()}
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
