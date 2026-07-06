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

/** 从 stats 响应构建 AdminDashboardData */
function buildDashboardData(d: Record<string, unknown>): AdminDashboardData {
  const svc = (d.services as Record<string, Record<string, unknown>>) || {};
  const ds = (d.data_stats as Record<string, unknown>) || {};
  const sys = (d.system as Record<string, unknown>) || {};
  const mem = (sys.memory as Record<string, number>) || {};
  const ranges = (ds.date_ranges as Record<string, string>) || {};
  const byMarket = (ds.by_market as Record<string, Record<string, number>>) || {};
  const marketBreakdown: Record<string, number> = {};
  for (const [market, info] of Object.entries(byMarket)) {
    marketBreakdown[market] = info.stocks || info.count || 0;
  }
  return {
    services: {
      goEngine: buildServiceHealth(svc.go_engine),
      goDataService: buildServiceHealth(svc.go_data_service),
      nodeServer: { status: 'healthy', latency: 5 },
    },
    dataStats: {
      totalTickers: (ds.total_tickers as number) || 0,
      totalSizeMB: (ds.total_size_mb as number) || 0,
      earliestDate: (ranges.earliest as string) || '-',
      latestDate: (ranges.latest as string) || '-',
      marketBreakdown,
    },
    system: {
      memoryMB: mem.rss_mb || 0,
      uptime: (sys.uptime_formatted as string) || '-',
    },
  };
}

function buildServiceHealth(raw: Record<string, unknown> | undefined): AdminServiceHealth {
  if (!raw) return { status: 'down' };
  return {
    status: raw.status === 'healthy' ? 'healthy' : 'down',
    latency: (raw.latency_ms as number) || undefined,
    version: raw.version as string | undefined,
    message: raw.error as string | undefined,
  };
}

function buildDataStats(d: Record<string, unknown>): AdminDataStats {
  const s = (d.stats as Record<string, unknown>) || {};
  const u = (d.universe as Record<string, unknown>) || {};
  const dq = (s.data_quality as Record<string, number>) || {};
  const ranges = (s.date_ranges as { earliest: string; latest: string }) || {
    earliest: '-',
    latest: '-',
  };
  const byMarket = (s.by_market as Record<string, Record<string, number>>) || {};
  const marketBreakdown: Record<string, number> = {};
  for (const [market, info] of Object.entries(byMarket)) {
    marketBreakdown[market] = info.stocks || info.count || 0;
  }
  return {
    totalTickers: (u.total as number) || 0,
    totalDataPoints: dq.total_data_points || 0,
    dateRange: ranges,
    totalSizeMB: dq.total_size_mb || 0,
    marketBreakdown,
  };
}

// ===== Store =====

export const useAdminStore = create<AdminState>((set, get) => ({
  dashboard: null,
  dataStats: null,
  systemInfo: null,
  loading: false,
  actionMsg: '',

  fetchDashboard: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch('/api/admin/stats');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        set({ dashboard: buildDashboardData(json.data) });
      }
    } catch {
      /* 静默失败，仪表盘显示默认空数据 */
    }
    set({ loading: false });
  },

  fetchDataStats: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch('/api/data/manage/stats');
      const json = await res.json();
      if (json.success && json.data) {
        set({ dataStats: buildDataStats(json.data) });
      }
    } catch {
      /* 静默失败 */
    }
    set({ loading: false });
  },

  fetchSystemInfo: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch('/api/admin/system');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        set({ systemInfo: json.data as AdminSystemInfo });
      }
    } catch {
      /* 静默失败 */
    }
    set({ loading: false });
  },

  triggerIncrementalUpdate: async () => {
    try {
      const res = await apiFetch('/api/data/manage/update/inc', { method: 'POST' });
      const json = await res.json();
      set({ actionMsg: json.success ? '增量更新已触发' : `失败: ${json.error}` });
      if (json.success) setTimeout(() => get().fetchDataStats(), 2000);
      return json.success === true;
    } catch {
      set({ actionMsg: '增量更新请求失败' });
      return false;
    }
  },

  triggerFullUpdate: async () => {
    try {
      const res = await apiFetch('/api/data/manage/update/full', { method: 'POST' });
      const json = await res.json();
      set({ actionMsg: json.success ? '全量更新已触发' : `失败: ${json.error}` });
      if (json.success) setTimeout(() => get().fetchDataStats(), 2000);
      return json.success === true;
    } catch {
      set({ actionMsg: '全量更新请求失败' });
      return false;
    }
  },

  triggerRefetch: async () => {
    try {
      const res = await apiFetch('/api/data/manage/update/refetch', { method: 'POST' });
      const json = await res.json();
      set({ actionMsg: json.success ? '缓存清理已触发' : `失败: ${json.error}` });
      return json.success === true;
    } catch {
      set({ actionMsg: '缓存清理请求失败' });
      return false;
    }
  },

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
