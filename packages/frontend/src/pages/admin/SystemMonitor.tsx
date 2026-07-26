/**
 * @file 系统监控页面
 * @description 实时展示各服务健康状态、延迟、版本及资源占用等运维指标
 * @route /admin/monitor
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Server, RefreshCw, Clock, HardDrive } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient.js';
import { usePolling } from '../../hooks/usePolling.js';
import { useToastStore } from '../../store/toastStore.js';
import { reportError } from '../../utils/errorReporter.js';
import { KpiCard } from '../../components/admin/KpiCard.js';
import { ServiceStatusBadge } from '../../components/admin/ServiceStatusBadge.js';
import { Button } from '../../components/ui/button.js';
import { Card } from '../../components/ui/card.js';
import { Progress } from '../../components/ui/progress.js';

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

/** 从 stats 接口单个服务响应构建 ServiceHealth */
function buildServiceHealth(
  name: string,
  raw: { status?: string; latency_ms?: number; version?: string; error?: string } | undefined,
  fallbackDown = true,
): ServiceHealth {
  if (!raw) {
    return {
      name,
      status: fallbackDown ? 'down' : 'healthy',
      latency: 0,
      version: undefined,
      message: undefined,
    };
  }
  return {
    name,
    status: raw.status === 'healthy' ? 'healthy' : 'down',
    latency: raw.latency_ms || 0,
    version: raw.version,
    message: raw.error,
  };
}

/** 从 stats 接口获取服务健康状态 */
async function fetchServices(): Promise<ServiceHealth[]> {
  const statsRes = await apiFetch('/api/v1/admin/stats');
  if (!statsRes.ok) return defaultMonitorData.services;
  const statsJson = await statsRes.json();
  if (!statsJson.success || !statsJson.data) return defaultMonitorData.services;
  const s = statsJson.data.services;
  return [
    buildServiceHealth('adminPage.dashboard.goEngine', s?.go_engine),
    buildServiceHealth('adminPage.dashboard.goDataService', s?.go_data_service),
    buildServiceHealth('adminPage.dashboard.nodeService', undefined, false),
  ];
}

/** 从 system 接口响应构建 MonitorData */
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

/** 控制栏 */
function ControlBar({
  loading,
  autoRefresh,
  lastRefresh,
  onRefresh,
  onAutoRefreshChange,
}: {
  loading: boolean;
  autoRefresh: boolean;
  lastRefresh: string;
  onRefresh: () => void;
  onAutoRefreshChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('adminPage.monitor.refresh')}
        </Button>
        <label className="flex items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => onAutoRefreshChange(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t('adminPage.monitor.autoRefresh')}
        </label>
      </div>
      <div className="text-xs text-fg-tertiary">
        {lastRefresh
          ? t('adminPage.monitor.lastUpdate', { time: lastRefresh })
          : t('adminPage.monitor.notRefreshed')}
      </div>
    </div>
  );
}

/** 内存使用详情 */
function MemoryUsageSection({ data }: { data: MonitorData }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="mb-4 text-sm font-semibold text-fg">{t('adminPage.monitor.memoryUsage')}</h2>
      <div className="space-y-4">
        <MemoryBar
          label={t('adminPage.monitor.rssMemory')}
          valueMB={data.system.memoryMB}
          totalMB={data.system.memoryMB}
        />
        <MemoryBar
          label={t('adminPage.monitor.heapUsed')}
          valueMB={data.system.heapUsedMB}
          totalMB={data.system.memoryMB}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border-subtle p-3">
          <p className="text-xs text-fg-tertiary">{t('dataEngine.totalDataPoints')}</p>
          <p className="text-lg font-bold text-fg">
            {data.dataDir.totalDataPoints > 0
              ? `${(data.dataDir.totalDataPoints / 1000000).toFixed(1)}M`
              : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-border-subtle p-3">
          <p className="text-xs text-fg-tertiary">{t('adminPage.dashboard.tickerFileCount')}</p>
          <p className="text-lg font-bold text-fg">{data.dataDir.tickerCount.toLocaleString()}</p>
        </div>
      </div>
    </Card>
  );
}

export default function SystemMonitor() {
  const { t } = useTranslation();
  const [data, setData] = useState<MonitorData>(defaultMonitorData);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchMonitorData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/admin/system');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;
      const services = await fetchServices();
      setData(buildMonitorData(json.data, services));
    } catch (error) {
      reportError(error, { component: 'SystemMonitor', action: 'fetchMonitorData' });
      useToastStore.getState().addToast('error', t('adminPage.monitor.loadFailed'));
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString('zh-CN'));
  };

  usePolling(fetchMonitorData, 10000, { enabled: autoRefresh, deps: [autoRefresh] });

  return (
    <div className="space-y-6">
      <ControlBar
        loading={loading}
        autoRefresh={autoRefresh}
        lastRefresh={lastRefresh}
        onRefresh={fetchMonitorData}
        onAutoRefreshChange={setAutoRefresh}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('adminPage.dashboard.nodeMemory')}
          value={`${data.system.memoryMB} MB`}
          subtitle={t('adminPage.monitor.heapUsage', { heap: data.system.heapUsedMB })}
          icon={<HardDrive className="h-5 w-5" />}
          color="blue"
        />
        <KpiCard
          label={t('adminPage.monitor.uptime')}
          value={data.system.uptime}
          icon={<Clock className="h-5 w-5" />}
          color="green"
        />
        <KpiCard
          label={t('adminPage.monitor.dataDirectory')}
          value={`${(data.dataDir.totalSizeMB / 1024).toFixed(1)} GB`}
          subtitle={t('adminPage.monitor.tickerCount', { count: data.dataDir.tickerCount })}
          icon={<Activity className="h-5 w-5" />}
          color="purple"
        />
      </div>

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-fg">
          {t('adminPage.monitor.serviceHealth')}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.services.map((service) => (
            <ServiceHealthCard key={service.name} service={service} />
          ))}
        </div>
      </Card>

      <MemoryUsageSection data={data} />
    </div>
  );
}

function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-fg-tertiary" />
          <span className="font-medium text-fg-secondary">{t(service.name)}</span>
        </div>
        <ServiceStatusBadge status={service.status} variant="pill" size="sm" />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-fg-tertiary">{t('adminPage.monitor.latency')}</span>
          <span className="font-medium text-fg-secondary">{service.latency}ms</span>
        </div>
        {service.version && (
          <div className="flex justify-between">
            <span className="text-fg-tertiary">{t('adminPage.monitor.version')}</span>
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
  );
}

function MemoryBar({
  label,
  valueMB,
  totalMB,
}: {
  label: string;
  valueMB: number;
  totalMB: number;
}) {
  const pct = totalMB > 0 ? Math.min((valueMB / totalMB) * 100, 100) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-fg-secondary">{label}</span>
        <span className="font-medium text-fg">{valueMB} MB</span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
