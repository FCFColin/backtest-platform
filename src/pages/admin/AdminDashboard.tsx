/**
 * @file 管理后台仪表盘
 * @description 管理后台首页，汇总展示系统健康状态、数据规模及关键运维指标
 * @route /admin
 */
import { useState, useEffect } from 'react';
import {
  Activity,
  Clock,
  Database,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { useToastStore } from '../../store/toastStore';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  message?: string;
  version?: string;
}

interface ServiceHealth {
  rustEngine: HealthStatus;
  goDataService: HealthStatus;
  nodeServer: HealthStatus;
}

interface DataStats {
  totalTickers: number;
  totalSizeMB: number;
  earliestDate: string;
  latestDate: string;
  marketBreakdown: Record<string, number>;
}

interface SystemInfo {
  memoryMB: number;
  uptime: string;
}

interface DashboardData {
  services: ServiceHealth;
  dataStats: DataStats;
  system: SystemInfo;
}

const defaultData: DashboardData = {
  services: {
    rustEngine: { status: 'down' },
    goDataService: { status: 'down' },
    nodeServer: { status: 'down' },
  },
  dataStats: {
    totalTickers: 0,
    totalSizeMB: 0,
    earliestDate: '-',
    latestDate: '-',
    marketBreakdown: {},
  },
  system: { memoryMB: 0, uptime: '-' },
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData>(defaultData);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          const ds = d.data_stats;
          const sys = d.system;

          // 服务健康映射
          const re = d.services?.rust_engine;
          const gds = d.services?.go_data_service;

          // 市场分布
          const marketBreakdown: Record<string, number> = {};
          if (ds?.by_market) {
            for (const [market, info] of Object.entries(ds.by_market)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const m = info as any;
              marketBreakdown[market] = m.stocks || m.count || m.total || 0;
            }
          }

          setData({
            services: {
              rustEngine: {
                status: re?.status === 'healthy' ? 'healthy' : re?.status === 'unhealthy' ? 'degraded' : 'down',
                latency: re?.latency_ms,
                version: re?.version,
                message: re?.error,
              },
              goDataService: {
                status: gds?.status === 'healthy' ? 'healthy' : gds?.status === 'unhealthy' ? 'degraded' : 'down',
                latency: gds?.latency_ms,
                version: gds?.version,
                message: gds?.error,
              },
              nodeServer: { status: 'healthy', latency: 5 },
            },
            dataStats: {
              totalTickers: ds?.total_tickers || ds?.universe_total || 0,
              totalSizeMB: ds?.total_size_mb || 0,
              earliestDate: ds?.date_range?.earliest || '-',
              latestDate: ds?.date_range?.latest || '-',
              marketBreakdown,
            },
            system: {
              memoryMB: sys?.memory?.rss_mb || 0,
              uptime: sys?.uptime_formatted || '-',
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      useToastStore.getState().addToast('error', '仪表盘数据加载失败');
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString('zh-CN'));
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalSizeGB = (data.dataStats.totalSizeMB / 1024).toFixed(1);

  return (
    <div className="space-y-6">
      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="标的总数"
          value={data.dataStats.totalTickers.toLocaleString()}
          icon={<Database className="h-5 w-5" />}
          color="blue"
        />
        <KpiCard
          title="数据总量"
          value={`${totalSizeGB} GB`}
          icon={<HardDrive className="h-5 w-5" />}
          color="green"
        />
        <KpiCard
          title="数据覆盖"
          value={data.dataStats.earliestDate !== '-'
            ? `${data.dataStats.earliestDate} ~ ${data.dataStats.latestDate}`
            : '-'
          }
          icon={<Activity className="h-5 w-5" />}
          color="purple"
        />
        <KpiCard
          title="Node 运行时间"
          value={data.system.uptime}
          icon={<Clock className="h-5 w-5" />}
          color="orange"
        />
      </div>

      {/* 服务状态 + 市场分布 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 服务状态 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">服务状态</h2>
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="space-y-3">
            <ServiceStatusItem
              name="Rust 引擎"
              port=":3002"
              status={data.services.rustEngine}
            />
            <ServiceStatusItem
              name="Go 数据服务"
              port=":3003"
              status={data.services.goDataService}
            />
            <ServiceStatusItem
              name="Node.js 服务"
              port=":3001"
              status={data.services.nodeServer}
            />
          </div>
          {lastRefresh && (
            <p className="mt-3 text-xs text-slate-400">上次刷新: {lastRefresh}</p>
          )}
        </div>

        {/* 市场分布 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">市场标的数量</h2>
          {Object.keys(data.dataStats.marketBreakdown).length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(data.dataStats.marketBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([market, count]) => (
                  <div key={market} className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">{market}</p>
                    <p className="text-lg font-bold text-slate-800">{count.toLocaleString()}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">暂无数据</p>
          )}
        </div>
      </div>

      {/* 系统资源 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">系统资源</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Node.js 内存</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{data.system.memoryMB} MB</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">数据目录大小</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{totalSizeGB} GB</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">标的文件数</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{data.dataStats.totalTickers.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ServiceStatusItem({
  name,
  port,
  status,
}: {
  name: string;
  port: string;
  status: HealthStatus;
}) {
  const statusConfig = {
    healthy: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    degraded: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    down: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  };

  const config = statusConfig[status.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-slate-400" />
        <div>
          <p className="text-sm font-medium text-slate-700">{name}</p>
          <p className="text-xs text-slate-400">{port}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status.latency != null && (
          <span className="text-xs text-slate-400">{status.latency}ms</span>
        )}
        {status.version && (
          <span className="text-xs text-slate-400">v{status.version}</span>
        )}
        <div className={`rounded-full p-1 ${config.bg}`}>
          <Icon className={`h-4 w-4 ${config.color}`} />
        </div>
      </div>
    </div>
  );
}
