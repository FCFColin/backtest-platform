/**
 * @file 管理后台仪表盘
 * @description 管理后台首页，汇总展示系统健康状态、数据规模及关键运维指标
 * @route /admin
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Clock, Database, Server, RefreshCw, HardDrive } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient.js';
import { usePolling } from '../../hooks/usePolling.js';
import { useToastStore } from '../../store/toastStore.js';
import {
  parseAdminStats,
  defaultParsedAdminStats,
  type ParsedAdminStats,
  type ServiceHealth,
} from '../../utils/adminStats.js';
import { KpiCard } from '../../components/admin/KpiCard.js';
import { ServiceStatusBadge } from '../../components/admin/ServiceStatusBadge.js';

/** KPI 卡片网格 */
function KpiGrid({ data, totalSizeGB }: { data: ParsedAdminStats; totalSizeGB: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={t('adminPage.dashboard.totalTickers')}
        value={data.dataStats.totalTickers.toLocaleString()}
        icon={<Database className="h-5 w-5" />}
        color="blue"
      />
      <KpiCard
        label={t('adminPage.dashboard.totalDataSize')}
        value={`${totalSizeGB} GB`}
        icon={<HardDrive className="h-5 w-5" />}
        color="green"
      />
      <KpiCard
        label={t('adminPage.dashboard.dataCoverage')}
        value={
          data.dataStats.earliestDate !== '-'
            ? `${data.dataStats.earliestDate} ~ ${data.dataStats.latestDate}`
            : '-'
        }
        icon={<Activity className="h-5 w-5" />}
        color="purple"
      />
      <KpiCard
        label={t('adminPage.dashboard.nodeUptime')}
        value={data.system.uptime}
        icon={<Clock className="h-5 w-5" />}
        color="orange"
      />
    </div>
  );
}

/** 服务状态 + 市场分布 */
function ServiceMarketSection({
  data,
  loading,
  lastRefresh,
  onRefresh,
}: {
  data: ParsedAdminStats;
  loading: boolean;
  lastRefresh: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            {t('adminPage.dashboard.serviceStatus')}
          </h2>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="space-y-3">
          <ServiceStatusItem
            name={t('adminPage.dashboard.goEngine')}
            port=":5004"
            status={data.services.goEngine}
          />
          <ServiceStatusItem
            name={t('adminPage.dashboard.goDataService')}
            port=":3003"
            status={data.services.goDataService}
          />
          <ServiceStatusItem
            name={t('adminPage.dashboard.nodeService')}
            port=":3001"
            status={data.services.nodeServer}
          />
        </div>
        {lastRefresh && (
          <p className="mt-3 text-xs text-slate-400">
            {t('adminPage.dashboard.lastRefresh')}: {lastRefresh}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          {t('adminPage.dashboard.marketTickerCount')}
        </h2>
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
          <p className="text-sm text-slate-400">{t('common.noData')}</p>
        )}
      </div>
    </div>
  );
}

/** 系统资源 */
function SystemResourceSection({
  data,
  totalSizeGB,
}: {
  data: ParsedAdminStats;
  totalSizeGB: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">
        {t('adminPage.dashboard.systemResource')}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {t('adminPage.dashboard.nodeMemory')}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{data.system.memoryMB} MB</p>
        </div>
        <div className="rounded-lg border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {t('adminPage.dashboard.dataDirSize')}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalSizeGB} GB</p>
        </div>
        <div className="rounded-lg border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {t('adminPage.dashboard.tickerFileCount')}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {data.dataStats.totalTickers.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<ParsedAdminStats>(defaultParsedAdminStats);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/stats');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;
      setData(parseAdminStats(json.data));
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      useToastStore.getState().addToast('error', t('adminPage.dashboard.loadFailed'));
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString('zh-CN'));
  };

  usePolling(fetchDashboardData, 30000);

  const totalSizeGB = (data.dataStats.totalSizeMB / 1024).toFixed(1);

  return (
    <div className="space-y-6">
      <KpiGrid data={data} totalSizeGB={totalSizeGB} />
      <ServiceMarketSection
        data={data}
        loading={loading}
        lastRefresh={lastRefresh}
        onRefresh={fetchDashboardData}
      />
      <SystemResourceSection data={data} totalSizeGB={totalSizeGB} />
    </div>
  );
}

/** 服务状态条目：服务名 + 端口 + 延迟 + 版本 + 状态徽章 */
function ServiceStatusItem({
  name,
  port,
  status,
}: {
  name: string;
  port: string;
  status: ServiceHealth;
}) {
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
        {status.version && <span className="text-xs text-slate-400">v{status.version}</span>}
        <ServiceStatusBadge status={status.status} variant="dot" size="md" />
      </div>
    </div>
  );
}
