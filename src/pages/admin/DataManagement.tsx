/**
 * @file 数据管理页面
 * @description 管理后台数据源管理，支持查看、刷新及触发数据采集任务
 * @route /admin/data
 */
import { useState, useEffect } from 'react';
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
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { useToastStore } from '../../store/toastStore';

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

const defaultDataSources: DataSource[] = [
  { name: 'Rust 回测引擎', type: 'api', status: 'unknown', recordCount: 0, lastUpdated: '-' },
  { name: 'Go 数据服务', type: 'api', status: 'unknown', recordCount: 0, lastUpdated: '-' },
  { name: '本地数据缓存', type: 'local', status: 'unknown', recordCount: 0, lastUpdated: '-' },
];

const defaultDataStats: DataStats = {
  totalTickers: 0,
  totalDataPoints: 0,
  dateRange: { earliest: '-', latest: '-' },
  totalSizeMB: 0,
  marketBreakdown: {},
};

export default function DataManagement() {
  const [sources, setSources] = useState<DataSource[]>(defaultDataSources);
  const [stats, setStats] = useState<DataStats>(defaultDataStats);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/data/manage/stats');
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        const s = d.stats;
        const u = d.universe;

        // 从真实数据构建统计
        const totalTickers = u?.total || 0;
        const totalDataPoints = s?.data_quality?.total_data_points || 0;
        const totalSizeMB = s?.data_quality?.total_size_mb || 0;
        const dateRanges = s?.date_ranges || { earliest: '-', latest: '-' };

        // 市场分布
        const marketBreakdown: Record<string, number> = {};
        if (s?.by_market) {
          for (const [market, info] of Object.entries(s.by_market)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const m = info as any;
            marketBreakdown[market] = m.stocks || m.count || 0;
          }
        }

        setStats({
          totalTickers,
          totalDataPoints,
          dateRange: dateRanges,
          totalSizeMB,
          marketBreakdown,
        });

        // 更新数据源状态
        const newSources = [...defaultDataSources];
        newSources[0] = {
          ...newSources[0],
          status: 'active',
          recordCount: totalDataPoints,
          lastUpdated: dateRanges.latest || '-',
        };
        newSources[2] = {
          ...newSources[2],
          status: totalTickers > 0 ? 'active' : 'inactive',
          recordCount: totalTickers,
          lastUpdated: dateRanges.latest || '-',
        };
        setSources(newSources);
      }
    } catch (e) {
      console.error('Failed to fetch data stats:', e);
      useToastStore.getState().addToast('error', '数据统计信息加载失败');
    }

    // 检查Go服务状态
    try {
      const goRes = await fetch('/api/data/health');
      if (goRes.ok) {
        setSources(prev => prev.map((s, i) =>
          i === 1 ? { ...s, status: 'active', lastUpdated: new Date().toISOString().slice(0, 19) } : s
        ));
      } else {
        setSources(prev => prev.map((s, i) =>
          i === 1 ? { ...s, status: 'inactive' } : s
        ));
      }
    } catch {
      setSources(prev => prev.map((s, i) =>
        i === 1 ? { ...s, status: 'inactive' } : s
      ));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const doAction = async (url: string, label: string) => {
    setActionMsg(`${label}中...`);
    try {
      const res = await apiFetch(url, { method: 'POST' });
      const json = await res.json();
      setActionMsg(json.success ? `${label}已触发` : `失败: ${json.error}`);
      if (json.success) {
        setTimeout(fetchData, 2000);
      }
    } catch {
      setActionMsg(`${label}请求失败`);
    }
    setTimeout(() => setActionMsg(''), 5000);
  };

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新统计
        </button>
        <button
          onClick={() => doAction('/api/data/manage/update/inc', '增量更新')}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
        >
          <Play className="h-4 w-4" />
          增量更新
        </button>
        <button
          onClick={() => doAction('/api/data/manage/update/full', '全量更新')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Zap className="h-4 w-4" />
          全量更新
        </button>
        {actionMsg && (
          <span className="text-sm font-medium text-blue-600">{actionMsg}</span>
        )}
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="标的总数"
          value={stats.totalTickers.toLocaleString()}
          icon={<BarChart3 className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="数据点总数"
          value={stats.totalDataPoints > 0 ? `${(stats.totalDataPoints / 1000000).toFixed(1)}M` : '-'}
          icon={<Database className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title="数据覆盖"
          value={stats.dateRange.earliest !== '-' ? `${stats.dateRange.earliest} ~ ${stats.dateRange.latest}` : '-'}
          icon={<Calendar className="h-5 w-5" />}
          color="purple"
        />
        <StatCard
          title="磁盘占用"
          value={stats.totalSizeMB > 0 ? `${(stats.totalSizeMB / 1024).toFixed(1)} GB` : '-'}
          icon={<HardDrive className="h-5 w-5" />}
          color="orange"
        />
      </div>

      {/* 数据源列表 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">数据源</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">数据源</th>
                <th className="pb-2 font-medium">类型</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">记录数</th>
                <th className="pb-2 font-medium">最后更新</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {source.type === 'api' ? (
                        <Globe className="h-4 w-4 text-blue-500" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-green-500" />
                      )}
                      <span className="font-medium text-slate-700">{source.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {source.type === 'api' ? 'API' : '本地'}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <SourceStatusBadge status={source.status} />
                  </td>
                  <td className="py-2.5 text-slate-500">
                    {source.recordCount > 0 ? source.recordCount.toLocaleString() : '-'}
                  </td>
                  <td className="py-2.5 text-slate-500">
                    {typeof source.lastUpdated === 'string' && source.lastUpdated.includes('T')
                      ? source.lastUpdated.replace('T', ' ').slice(0, 19)
                      : source.lastUpdated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 市场标的数量统计 */}
      {Object.keys(stats.marketBreakdown).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">市场标的数量</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(stats.marketBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([market, count]) => (
                <CoverageItem key={market} label={market} value={count} />
              ))}
          </div>
        </div>
      )}

      {/* 数据覆盖日期范围 */}
      {stats.dateRange.earliest !== '-' && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">数据覆盖日期范围</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-xs text-slate-500">
                <span>{stats.dateRange.earliest}</span>
                <span>{stats.dateRange.latest}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                  style={{ width: '100%' }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                覆盖 {getYearDiff(stats.dateRange.earliest, stats.dateRange.latest)} 年数据
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
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

function SourceStatusBadge({ status }: { status: 'active' | 'inactive' | 'unknown' }) {
  const config = {
    active: { icon: CheckCircle, label: '活跃', className: 'bg-green-50 text-green-600' },
    inactive: { icon: AlertCircle, label: '离线', className: 'bg-red-50 text-red-600' },
    unknown: { icon: AlertCircle, label: '未知', className: 'bg-slate-50 text-slate-500' },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function CoverageItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-800">{value.toLocaleString()}</p>
    </div>
  );
}

function getYearDiff(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}
