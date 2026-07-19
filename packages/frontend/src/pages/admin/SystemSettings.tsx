/**
 * @file 系统设置页面
 * @description 管理后台系统配置，包括服务地址、应用参数等可持久化设置项
 * @route /admin/settings
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Server, Database, RefreshCw, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient.js';
import { useToastStore } from '../../store/toastStore.js';

interface ServiceConfig {
  name: string;
  url: string;
  status: 'healthy' | 'down';
  version?: string;
}

interface AppConfig {
  services: ServiceConfig[];
  nodeEnv: string;
  nodeVersion: string;
  platform: string;
  pid: number;
}

const DEFAULT_CONFIG: AppConfig = {
  services: [
    { name: 'adminPage.dashboard.goEngine', url: 'http://127.0.0.1:5004', status: 'down' },
    { name: 'adminPage.dashboard.goDataService', url: 'http://127.0.0.1:3003', status: 'down' },
    { name: 'adminPage.dashboard.nodeService', url: 'http://127.0.0.1:3001', status: 'down' },
  ],
  nodeEnv: 'development',
  nodeVersion: '-',
  platform: '-',
  pid: 0,
};

/** 从 API 响应构建服务列表 */
function buildServicesFromApi(d: Record<string, unknown>): ServiceConfig[] {
  const svc = d.services as Record<string, { status?: string; version?: string }> | undefined;
  return [
    {
      name: 'adminPage.dashboard.goEngine',
      url: 'http://127.0.0.1:5004',
      status: svc?.go_engine?.status === 'healthy' ? 'healthy' : 'down',
      version: svc?.go_engine?.version,
    },
    {
      name: 'adminPage.dashboard.goDataService',
      url: 'http://127.0.0.1:3003',
      status: svc?.goDataService?.status === 'healthy' ? 'healthy' : 'down',
      version: svc?.goDataService?.version,
    },
    {
      name: 'adminPage.dashboard.nodeService',
      url: 'http://127.0.0.1:3001',
      status: svc?.nodeServer?.status === 'healthy' ? 'healthy' : 'down',
    },
  ];
}

/** 服务配置区块 */
function ServiceConfigSection({ services }: { services: ServiceConfig[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">
          {t('adminPage.settings.serviceConfig')}
        </h2>
      </div>
      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
          >
            <div>
              <p className="text-sm font-medium text-slate-700">{t(service.name)}</p>
              <p className="text-xs text-slate-400">{service.url}</p>
            </div>
            <div className="flex items-center gap-3">
              {service.version && (
                <span className="text-xs text-slate-400">v{service.version}</span>
              )}
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${service.status === 'healthy' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}
              >
                {service.status === 'healthy'
                  ? t('adminPage.settings.statusOnline')
                  : t('adminPage.dataManagement.statusInactive')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 运行环境区块 */
function RuntimeEnvSection({ config }: { config: AppConfig }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Settings className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">
          {t('adminPage.settings.runtimeEnv')}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">{t('adminPage.settings.nodeVersion')}</p>
          <p className="text-sm font-medium text-slate-700">{config.nodeVersion}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t('adminPage.settings.runMode')}</p>
          <p className="text-sm font-medium text-slate-700">{config.nodeEnv}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t('adminPage.settings.pid')}</p>
          <p className="text-sm font-medium text-slate-700">-</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t('adminPage.settings.platform')}</p>
          <p className="text-sm font-medium text-slate-700">{navigator.platform || '-'}</p>
        </div>
      </div>
    </div>
  );
}

/** 数据管理区块 */
interface DataManagementProps {
  onClearCache: () => void;
  onRestart: (service: string) => void;
}

function DataManagementSection({ onClearCache, onRestart }: DataManagementProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">
          {t('adminPage.settings.dataManagement')}
        </h2>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onClearCache}
          className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100"
        >
          <RotateCcw className="h-4 w-4" />
          {t('adminPage.settings.refetchData')}
        </button>
        <button
          onClick={() => onRestart('Go')}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          {t('adminPage.settings.refreshGoCache')}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-400">{t('adminPage.settings.dataManagementHint')}</p>
    </div>
  );
}

/** 架构说明区块 */
function ArchitectureSection() {
  const { t } = useTranslation();
  const items = [
    { color: 'bg-blue-500', text: t('adminPage.settings.archGoEngine') },
    { color: 'bg-green-500', text: t('adminPage.settings.archGoData') },
    { color: 'bg-yellow-500', text: t('adminPage.settings.archNode') },
    { color: 'bg-purple-500', text: t('adminPage.settings.archVite') },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">
        {t('adminPage.settings.architecture')}
      </h2>
      <div className="space-y-2 text-sm text-slate-600">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 inline-block h-2 w-2 rounded-full ${item.color}`} />
            <p>
              <strong>{item.text.split('—')[0].trim()}</strong> — {item.text.split('—')[1]?.trim()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function SystemSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setConfig((prev) => ({ ...prev, services: buildServicesFromApi(json.data) }));
        }
      }
    } catch (e) {
      console.error('Failed to fetch config:', e);
      useToastStore.getState().addToast('error', t('adminPage.settings.loadFailed'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleClearCache = async () => {
    setSaveMsg(t('adminPage.settings.clearingCache'));
    try {
      const res = await apiFetch('/api/data/manage/update/refetch', { method: 'POST' });
      const json = await res.json();
      setSaveMsg(
        json.success
          ? t('adminPage.settings.cacheCleared')
          : t('adminPage.dataManagement.actionFailed', { error: json.error }),
      );
    } catch {
      setSaveMsg(t('adminPage.dataManagement.actionRequestFailed', { label: '' }));
    }
    setTimeout(() => setSaveMsg(''), 5000);
  };

  const handleRestart = (service: string) => {
    setSaveMsg(t('adminPage.settings.restartHint', { service }));
    setTimeout(() => setSaveMsg(''), 5000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={fetchConfig}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('adminPage.monitor.refresh')}
        </button>
        {saveMsg && <span className="text-sm font-medium text-blue-600">{saveMsg}</span>}
      </div>

      <ServiceConfigSection services={config.services} />
      <RuntimeEnvSection config={config} />
      <DataManagementSection onClearCache={handleClearCache} onRestart={handleRestart} />
      <ArchitectureSection />
    </div>
  );
}
