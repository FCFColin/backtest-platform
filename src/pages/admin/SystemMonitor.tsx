/**
 * @file 系统监控页面
 * @description 实时展示各服务健康状态、延迟、版本及资源占用等运维指标
 * @route /admin/monitor
 */
import { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  HardDrive,
} from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { useToastStore } from '../../store/toastStore';

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
    { name: 'Rust 引擎', status: 'down', latency: 0 },
    { name: 'Go 数据服务', status: 'down', latency: 0 },
    { name: 'Node.js 服务', status: 'down', latency: 0 },
  ],
  system: { memoryMB: 0, heapUsedMB: 0, uptime: '-', uptimeSeconds: 0 },
  dataDir: { totalSizeMB: 0, tickerCount: 0, totalDataPoints: 0 },
};

export default function SystemMonitor() {
  const [data, setData] = useState<MonitorData>(defaultMonitorData);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchMonitorData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/system');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;

          // 服务健康（从stats接口获取）
          const statsRes = await apiFetch('/api/admin/stats');
          let services = defaultMonitorData.services;
          if (statsRes.ok) {
            const statsJson = await statsRes.json();
            if (statsJson.success && statsJson.data) {
              const s = statsJson.data.services;
              services = [
                {
                  name: 'Rust 引擎',
                  status: s?.rust_engine?.status === 'healthy' ? 'healthy' : 'down',
                  latency: s?.rust_engine?.latency_ms || 0,
                  version: s?.rust_engine?.version,
                  message: s?.rust_engine?.error,
                },
                {
                  name: 'Go 数据服务',
                  status: s?.go_data_service?.status === 'healthy' ? 'healthy' : 'down',
                  latency: s?.go_data_service?.latency_ms || 0,
                  version: s?.go_data_service?.version,
                  message: s?.go_data_service?.error,
                },
                {
                  name: 'Node.js 服务',
                  status: 'healthy' as const,
                  latency: 5,
                },
              ];
            }
          }

          setData({
            services,
            system: {
              memoryMB: d.memory?.rss_mb || 0,
              heapUsedMB: d.memory?.heap_used_mb || 0,
              uptime: d.uptime?.formatted || '-',
              uptimeSeconds: d.uptime?.seconds || 0,
            },
            dataDir: {
              totalSizeMB: d.data_directory?.total_size_mb || 0,
              tickerCount: d.data_directory?.ticker_file_count || 0,
              totalDataPoints: d.data_directory?.total_data_points || 0,
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch monitor data:', error);
      useToastStore.getState().addToast('error', '监控数据加载失败');
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString('zh-CN'));
  };

  useEffect(() => {
    fetchMonitorData();
    if (autoRefresh) {
      const interval = setInterval(fetchMonitorData, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return (
    <div className="space-y-6">
      {/* 控制栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={fetchMonitorData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            自动刷新 (10s)
          </label>
        </div>
        <div className="text-xs text-slate-400">
          {lastRefresh ? `上次更新: ${lastRefresh}` : '未刷新'}
        </div>
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Node.js 内存"
          value={`${data.system.memoryMB} MB`}
          subtitle={`堆使用: ${data.system.heapUsedMB} MB`}
          icon={<HardDrive className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="运行时间"
          value={data.system.uptime}
          icon={<Clock className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title="数据目录"
          value={`${(data.dataDir.totalSizeMB / 1024).toFixed(1)} GB`}
          subtitle={`${data.dataDir.tickerCount} 个标的`}
          icon={<Activity className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* 服务健康状态详情 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">服务健康状态</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.services.map((service) => (
            <ServiceHealthCard key={service.name} service={service} />
          ))}
        </div>
      </div>

      {/* 内存使用详情 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">内存使用</h2>
        <div className="space-y-4">
          <MemoryBar
            label="RSS (常驻内存)"
            valueMB={data.system.memoryMB}
            totalMB={data.system.memoryMB}
          />
          <MemoryBar
            label="堆已使用"
            valueMB={data.system.heapUsedMB}
            totalMB={data.system.memoryMB}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">数据点总数</p>
            <p className="text-lg font-bold text-slate-800">
              {data.dataDir.totalDataPoints > 0
                ? `${(data.dataDir.totalDataPoints / 1000000).toFixed(1)}M`
                : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">标的文件数</p>
            <p className="text-lg font-bold text-slate-800">
              {data.dataDir.tickerCount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-800">{value}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const statusConfig = {
    healthy: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: '健康' },
    degraded: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-50', label: '降级' },
    down: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: '离线' },
  };

  const config = statusConfig[service.status];
  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-slate-100 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-400" />
          <span className="font-medium text-slate-700">{service.name}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${config.bg}`}>
          <Icon className={`h-3 w-3 ${config.color}`} />
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">延迟</span>
          <span className="font-medium text-slate-700">{service.latency}ms</span>
        </div>
        {service.version && (
          <div className="flex justify-between">
            <span className="text-slate-500">版本</span>
            <span className="font-medium text-slate-700">{service.version}</span>
          </div>
        )}
        {service.message && (
          <div className="mt-2 rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">{service.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryBar({ label, valueMB, totalMB }: { label: string; valueMB: number; totalMB: number }) {
  const pct = totalMB > 0 ? Math.min((valueMB / totalMB) * 100, 100) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-700">{valueMB} MB</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
