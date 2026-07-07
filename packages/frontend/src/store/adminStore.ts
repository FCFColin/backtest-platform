/**
 * 管理后台状态（Zustand）
 *
 * 包装所有管理后台 API 调用，替代各页面组件中直接使用 apiFetch。
 * 统一提供 loading/error 状态，避免每个页面重复实现。
 *
 * 迁移指南见 docs/macro-review/admin-store-migration-guide.md
 */
import { create } from 'zustand';
import { apiFetch } from '../utils/apiClient';
import { adminStatsSchema, dataManageStatsSchema, adminSystemSchema } from '../schemas/adminApi';

// ===== 类型定义 =====

export interface AdminServiceHealth {
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  message?: string;
  version?: string;
}

export interface AdminDashboardData {
  services: {
    goEngine: AdminServiceHealth;
    goDataService: AdminServiceHealth;
    nodeServer: AdminServiceHealth;
  };
  dataStats: {
    totalTickers: number;
    totalSizeMB: number;
    earliestDate: string;
    latestDate: string;
    marketBreakdown: Record<string, number>;
  };
  system: {
    memoryMB: number;
    uptime: string;
  };
}

export interface AdminDataStats {
  totalTickers: number;
  totalDataPoints: number;
  dateRange: { earliest: string; latest: string };
  totalSizeMB: number;
  marketBreakdown: Record<string, number>;
}

export interface AdminSystemInfo {
  memory: { rss_mb: number; heap_used_mb: number; heap_total_mb: number; external_mb: number };
  uptime: { seconds: number; formatted: string };
  dataDirectory: { total_size_mb: number; ticker_file_count: number; total_data_points: number };
}

// ===== Store 状态 =====

interface AdminState {
  /** 仪表盘数据 */
  dashboard: AdminDashboardData | null;
  /** 数据管理统计 */
  dataStats: AdminDataStats | null;
  /** 系统监控信息 */
  systemInfo: AdminSystemInfo | null;

  /** 全局 loading 状态 */
  loading: boolean;
  /** 上一次操作消息 */
  actionMsg: string;

  /** 仪表盘数据刷新 */
  fetchDashboard: () => Promise<void>;
  /** 数据管理统计刷新 */
  fetchDataStats: () => Promise<void>;
  /** 系统监控刷新（同时刷新 services） */
  fetchSystemInfo: () => Promise<void>;

  /** 触发增量更新 */
  triggerIncrementalUpdate: () => Promise<boolean>;
  /** 触发全量更新 */
  triggerFullUpdate: () => Promise<boolean>;
  /** 触发缓存清理 */
  triggerRefetch: () => Promise<boolean>;
  /** 获取 Go 数据服务健康状态 */
  fetchGoDataHealth: () => Promise<'active' | 'inactive'>;

  /** 设置操作消息 */
  setActionMsg: (msg: string) => void;
}

// ===== 辅助函数 =====

function buildServiceHealth(
  raw: { status?: string; latency_ms?: number; version?: string; error?: string } | undefined,
): AdminServiceHealth {
  if (!raw) return { status: 'down' };
  return {
    status: raw.status === 'healthy' ? 'healthy' : 'down',
    latency: raw.latency_ms ?? undefined,
    version: raw.version,
    message: raw.error,
  };
}

function buildMarketLookup(
  byMarket: Record<string, { stocks?: number; count?: number }>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, info] of Object.entries(byMarket)) {
    result[key] = info.stocks ?? info.count ?? 0;
  }
  return result;
}

function buildDataFields(
  ds:
    | {
        date_ranges?: { earliest?: string; latest?: string };
        total_tickers?: number;
        total_size_mb?: number;
        by_market?: Record<string, { stocks?: number; count?: number }>;
      }
    | undefined,
): AdminDashboardData['dataStats'] {
  const marketBreakdown = ds?.by_market ? buildMarketLookup(ds.by_market) : {};
  return {
    totalTickers: ds?.total_tickers ?? 0,
    totalSizeMB: ds?.total_size_mb ?? 0,
    earliestDate: ds?.date_ranges?.earliest ?? '-',
    latestDate: ds?.date_ranges?.latest ?? '-',
    marketBreakdown,
  };
}

function buildSystemFields(
  sys: { memory?: { rss_mb?: number }; uptime_formatted?: string } | undefined,
): AdminDashboardData['system'] {
  return {
    memoryMB: sys?.memory?.rss_mb ?? 0,
    uptime: sys?.uptime_formatted ?? '-',
  };
}

function buildDashboardData(d: unknown): AdminDashboardData {
  const parsed = adminStatsSchema.safeParse(d);
  const svc = parsed.data?.services;
  return {
    services: {
      goEngine: buildServiceHealth(svc?.go_engine),
      goDataService: buildServiceHealth(svc?.go_data_service),
      nodeServer: { status: 'healthy', latency: 5 },
    },
    dataStats: buildDataFields(parsed.data?.data_stats),
    system: buildSystemFields(parsed.data?.system),
  };
}

function buildDataStats(d: unknown): AdminDataStats {
  const parsed = dataManageStatsSchema.safeParse(d);
  const s = parsed.data?.stats;
  const u = parsed.data?.universe;
  const dq = s?.data_quality;
  const ranges = s?.date_ranges ?? { earliest: '-', latest: '-' };
  const byMarket = s?.by_market;
  const marketBreakdown = byMarket
    ? buildMarketLookup(byMarket as Record<string, { stocks?: number; count?: number }>)
    : {};
  return {
    totalTickers: u?.total ?? 0,
    totalDataPoints: dq?.total_data_points ?? 0,
    dateRange: ranges,
    totalSizeMB: dq?.total_size_mb ?? 0,
    marketBreakdown,
  };
}

type SetFn = (partial: Partial<AdminState>) => void;
type GetFn = () => AdminState;

async function fetchWithLoading<T>(
  set: SetFn,
  url: string,
  transform: (data: unknown) => T,
  setKey: (data: T) => Partial<AdminState>,
): Promise<void> {
  set({ loading: true });
  try {
    const res = await apiFetch(url);
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      set(setKey(transform(json.data)));
    }
  } catch {
    /* 静默失败 */
  }
  set({ loading: false });
}

async function triggerAction(
  set: SetFn,
  get: GetFn,
  opts: {
    url: string;
    successMsg: string;
    failMsg: string;
    refreshAfter?: boolean;
  },
): Promise<boolean> {
  try {
    const res = await apiFetch(opts.url, { method: 'POST' });
    const json = await res.json();
    set({ actionMsg: json.success ? opts.successMsg : `失败: ${json.error}` });
    if (json.success && opts.refreshAfter) setTimeout(() => get().fetchDataStats(), 2000);
    return json.success === true;
  } catch {
    set({ actionMsg: opts.failMsg });
    return false;
  }
}

// ===== Store =====

export const useAdminStore = create<AdminState>((set, get) => ({
  dashboard: null,
  dataStats: null,
  systemInfo: null,
  loading: false,
  actionMsg: '',

  fetchDashboard: () =>
    fetchWithLoading(set, '/api/admin/stats', buildDashboardData, (data) => ({
      dashboard: data,
    })),

  fetchDataStats: () =>
    fetchWithLoading(set, '/api/data/manage/stats', buildDataStats, (data) => ({
      dataStats: data,
    })),

  fetchSystemInfo: () =>
    fetchWithLoading(
      set,
      '/api/admin/system',
      (data) => adminSystemSchema.parse(data) as unknown as AdminSystemInfo,
      (data) => ({
        systemInfo: data,
      }),
    ),

  triggerIncrementalUpdate: () =>
    triggerAction(set, get, {
      url: '/api/data/manage/update/inc',
      successMsg: '增量更新已触发',
      failMsg: '增量更新请求失败',
      refreshAfter: true,
    }),

  triggerFullUpdate: () =>
    triggerAction(set, get, {
      url: '/api/data/manage/update/full',
      successMsg: '全量更新已触发',
      failMsg: '全量更新请求失败',
      refreshAfter: true,
    }),

  triggerRefetch: () =>
    triggerAction(set, get, {
      url: '/api/data/manage/update/refetch',
      successMsg: '缓存清理已触发',
      failMsg: '缓存清理请求失败',
    }),

  fetchGoDataHealth: async () => {
    try {
      const goRes = await fetch('/api/data/health');
      return goRes.ok ? 'active' : 'inactive';
    } catch {
      return 'inactive';
    }
  },

  setActionMsg: (msg: string) => set({ actionMsg: msg }),
}));
