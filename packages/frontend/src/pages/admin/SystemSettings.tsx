/**
 * @file 系统设置页面
 * @description 管理后台系统配置，包括服务地址、应用参数等可持久化设置项
 * @route /admin/settings
 */
import { useState, useEffect } from 'react';
import { Settings, Server, Database, RefreshCw, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { useToastStore } from '../../store/toastStore';

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
    { name: 'Go 引擎', url: 'http://127.0.0.1:5004', status: 'down' },
    { name: 'Go 数据服务', url: 'http://127.0.0.1:3003', status: 'down' },
    { name: 'Node.js 服务', url: 'http://127.0.0.1:3001', status: 'down' },
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
      name: 'Go 引擎',
      url: 'http://127.0.0.1:5004',
      status: svc?.go_engine?.status === 'healthy' ? 'healthy' : 'down',
      version: svc?.go_engine?.version,
    },
    {
      name: 'Go 数据服务',
      url: 'http://127.0.0.1:3003',
      status: svc?.goDataService?.status === 'healthy' ? 'healthy' : 'down',
      version: svc?.goDataService?.version,
    },
    {
      name: 'Node.js 服务',
      url: 'http://127.0.0.1:3001',
      status: svc?.nodeServer?.status === 'healthy' ? 'healthy' : 'down',
    },
  ];
}

/** 服务配置区块 */
function ServiceConfigSection({ services }: { services: ServiceConfig[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">服务配置</h2>
      </div>
      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
          >
            <div>
              <p className="text-sm font-medium text-slate-700">{service.name}</p>
              <p className="text-xs text-slate-400">{service.url}</p>
            </div>
            <div className="flex items-center gap-3">
              {service.version && (
                <span className="text-xs text-slate-400">v{service.version}</span>
              )}
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${service.status === 'healthy' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}
              >
                {service.status === 'healthy' ? '在线' : '离线'}
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
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Settings className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">运行环境</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Node.js 版本</p>
          <p className="text-sm font-medium text-slate-700">{config.nodeVersion}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">运行模式</p>
          <p className="text-sm font-medium text-slate-700">{config.nodeEnv}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">进程 PID</p>
          <p className="text-sm font-medium text-slate-700">-</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">平台</p>
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
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">数据管理</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onClearCache}
          className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100"
        >
          <RotateCcw className="h-4 w-4" />
          重新获取数据
        </button>
        <button
          onClick={() => onRestart('Go')}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          刷新Go服务缓存
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        重新获取数据会触发全量数据更新，耗时较长。Go服务缓存刷新会清除内存中的缓存数据。
      </p>
    </div>
  );
}

/** 架构说明区块 */
function ArchitectureSection() {
  const items = [
    {
      color: 'bg-blue-500',
      text: 'Go 引擎 (:5004) — CPU密集计算：回测、蒙特卡洛、优化器、有效前沿',
    },
    {
      color: 'bg-green-500',
      text: 'Go 数据服务 (:3003) — I/O密集：数据获取、缓存、搜索、baostock TCP',
    },
    { color: 'bg-yellow-500', text: 'Node.js (:3001) — 胶水层：路由转发、类型校验、降级处理' },
    { color: 'bg-purple-500', text: 'Vite (:5173) — 前端开发服务器，生产环境由静态文件服务替代' },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">系统架构</h2>
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
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const fetchConfig = async () => {
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
      useToastStore.getState().addToast('error', '系统配置加载失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleClearCache = async () => {
    setSaveMsg('清理缓存中...');
    try {
      const res = await apiFetch('/api/data/manage/update/refetch', { method: 'POST' });
      const json = await res.json();
      setSaveMsg(json.success ? '缓存清理已触发' : `失败: ${json.error}`);
    } catch {
      setSaveMsg('请求失败');
    }
    setTimeout(() => setSaveMsg(''), 5000);
  };

  const handleRestart = (service: string) => {
    setSaveMsg(`重启 ${service} 需要手动操作服务器`);
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
          刷新
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
