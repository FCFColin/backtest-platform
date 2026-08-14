import { useTranslation } from 'react-i18next';
import { Activity, Clock, Database, Server, RefreshCw, HardDrive } from 'lucide-react';
import { useAdminFetch, usePolling } from '../../hooks/miscHooks.js';
import {
  parseAdminStats,
  defaultParsedAdminStats,
  type ParsedAdminStats,
} from '../../utils/adminStats.js';
import { KpiCard, ServiceStatusTable } from '../../components/admin/AdminLayout.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
function KpiGrid({ data, totalSizeGB }: { data: ParsedAdminStats; totalSizeGB: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={t('Total Tickers')}
        value={data.dataStats.totalTickers.toLocaleString()}
        icon={<Database className="h-5 w-5" />}
        color="blue"
      />
      <KpiCard
        label={t('Total Data Size')}
        value={`${totalSizeGB} GB`}
        icon={<HardDrive className="h-5 w-5" />}
        color="green"
      />
      <KpiCard
        label={t('Data Coverage')}
        value={
          data.dataStats.earliestDate !== '-'
            ? `${data.dataStats.earliestDate} ~ ${data.dataStats.latestDate}`
            : '-'
        }
        icon={<Activity className="h-5 w-5" />}
        color="purple"
      />
      <KpiCard
        label={t('Node Uptime')}
        value={data.system.uptime}
        icon={<Clock className="h-5 w-5" />}
        color="orange"
      />
    </div>
  );
}
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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">{t('Service Status')}</h2>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded p-1 text-fg-tertiary hover:bg-hover hover:text-fg disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <ServiceStatusTable services={data.services} />
        {lastRefresh && (
          <p className="mt-3 text-xs text-fg-tertiary">
            {t('Last Refresh')}: {lastRefresh}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
        <h2 className="mb-4 text-sm font-semibold text-fg">{t('Market Ticker Count')}</h2>
        {Object.keys(data.dataStats.marketBreakdown).length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(data.dataStats.marketBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([market, count]) => (
                <div key={market} className="rounded-lg border border-border-subtle p-3">
                  <p className="text-xs text-fg-tertiary">{market}</p>
                  <p className="text-lg font-bold text-fg">{count.toLocaleString()}</p>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-fg-tertiary">{t('No data')}</p>
        )}
      </div>
    </div>
  );
}
function SystemResourceSection({
  data,
  totalSizeGB,
}: {
  data: ParsedAdminStats;
  totalSizeGB: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-4 text-sm font-semibold text-fg">{t('System Resources')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border-subtle p-4">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-fg-tertiary" />
            <span className="text-sm font-medium text-fg-secondary">{t('Node Memory')}</span>
          </div>
          <p className="text-2xl font-bold text-fg">{data.system.memoryMB} MB</p>
        </div>
        <div className="rounded-lg border border-border-subtle p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4 text-fg-tertiary" />
            <span className="text-sm font-medium text-fg-secondary">
              {t('Data Directory Size')}
            </span>
          </div>
          <p className="text-2xl font-bold text-fg">{totalSizeGB} GB</p>
        </div>
        <div className="rounded-lg border border-border-subtle p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-fg-tertiary" />
            <span className="text-sm font-medium text-fg-secondary">{t('Ticker File Count')}</span>
          </div>
          <p className="text-2xl font-bold text-fg">
            {data.dataStats.totalTickers.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
export default function AdminDashboard() {
  const {
    data,
    loading,
    lastRefresh,
    fetch: fetchDashboardData,
  } = useAdminFetch(
    '/api/v1/admin/stats',
    parseAdminStats,
    defaultParsedAdminStats,
    'AdminDashboard',
  );
  usePolling(fetchDashboardData, 30000);
  const totalSizeGB = (data.dataStats.totalSizeMB / 1024).toFixed(1);
  return (
    <ToolPageLayout
      params={<KpiGrid data={data} totalSizeGB={totalSizeGB} />}
      afterParams={
        <div className="space-y-3">
          <ServiceMarketSection
            data={data}
            loading={loading}
            lastRefresh={lastRefresh}
            onRefresh={fetchDashboardData}
          />
          <SystemResourceSection data={data} totalSizeGB={totalSizeGB} />
        </div>
      }
    />
  );
}
