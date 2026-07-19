/**
 * @file Admin stats 解析工具
 * @description 解析 /api/admin/stats 接口响应，统一服务健康、数据规模、系统信息提取逻辑
 */

/** 单个服务的健康状态 */
export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  version?: string;
  message?: string;
}

/** 三大服务（Go 引擎 / Go 数据服务 / Node 服务）健康状态集合 */
export interface ServiceHealthGroup {
  goEngine: ServiceHealth;
  goDataService: ServiceHealth;
  nodeServer: ServiceHealth;
}

/** 数据规模统计 */
export interface ParsedDataStats {
  totalTickers: number;
  totalSizeMB: number;
  earliestDate: string;
  latestDate: string;
  marketBreakdown: Record<string, number>;
}

/** 系统资源信息（来自 /api/admin/stats 的 system 字段） */
export interface ParsedSystemInfo {
  memoryMB: number;
  uptime: string;
}

/** /api/admin/stats 响应解析结果 */
export interface ParsedAdminStats {
  services: ServiceHealthGroup;
  dataStats: ParsedDataStats;
  system: ParsedSystemInfo;
}

/** 默认空数据，避免 null 检查 */
export const defaultParsedAdminStats: ParsedAdminStats = {
  services: {
    goEngine: { status: 'down' },
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

/**
 * 从 by_market 字段提取市场->股票数映射。
 * 兼容 stocks / count / total 三种字段命名。
 * @param byMarket - API 响应中的 by_market 字段
 * @returns 市场->股票数映射，空输入返回空对象
 */
export function parseMarketBreakdown(
  byMarket: Record<string, unknown> | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!byMarket) return result;
  for (const [market, info] of Object.entries(byMarket)) {
    if (!info || typeof info !== 'object') continue;
    const m = info as Record<string, number>;
    result[market] = m.stocks || m.count || m.total || 0;
  }
  return result;
}

/** 将服务状态字符串映射为健康状态枚举 */
function mapServiceStatus(status: unknown): 'healthy' | 'degraded' | 'down' {
  if (status === 'healthy') return 'healthy';
  if (status === 'unhealthy') return 'degraded';
  return 'down';
}

/** 从单个服务对象构建 ServiceHealth */
function parseServiceHealth(svc: Record<string, unknown> | undefined): ServiceHealth {
  if (!svc) return { status: 'down' };
  return {
    status: mapServiceStatus(svc.status),
    latency: svc.latency_ms as number | undefined,
    version: svc.version as string | undefined,
    message: svc.error as string | undefined,
  };
}

/** 从 services 字段构建 ServiceHealthGroup */
function parseServices(services: Record<string, unknown> | undefined): ServiceHealthGroup {
  const svcMap = services as Record<string, Record<string, unknown>> | undefined;
  return {
    goEngine: parseServiceHealth(svcMap?.go_engine),
    goDataService: parseServiceHealth(svcMap?.go_data_service),
    nodeServer: { status: 'healthy', latency: 5 },
  };
}

/** 从 data_stats 字段构建 ParsedDataStats */
function parseDataStats(ds: Record<string, unknown> | undefined): ParsedDataStats {
  const ranges = ds?.date_ranges as Record<string, string> | undefined;
  const totalTickers = (ds?.total_tickers as number) || (ds?.universe_total as number) || 0;
  return {
    totalTickers,
    totalSizeMB: (ds?.total_size_mb as number) || 0,
    earliestDate: ranges?.earliest || '-',
    latestDate: ranges?.latest || '-',
    marketBreakdown: parseMarketBreakdown(ds?.by_market as Record<string, unknown> | undefined),
  };
}

/** 从 system 字段构建 ParsedSystemInfo */
function parseSystemInfo(sys: Record<string, unknown> | undefined): ParsedSystemInfo {
  const mem = sys?.memory as Record<string, number> | undefined;
  return {
    memoryMB: mem?.rss_mb || 0,
    uptime: (sys?.uptime_formatted as string) || '-',
  };
}

/**
 * 解析 /api/admin/stats 接口响应。
 * @param raw - 接口响应的 data 字段
 * @returns 解析后的结构化数据，缺失字段以默认值填充
 */
export function parseAdminStats(raw: unknown): ParsedAdminStats {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    services: parseServices(d.services as Record<string, unknown> | undefined),
    dataStats: parseDataStats(d.data_stats as Record<string, unknown> | undefined),
    system: parseSystemInfo(d.system as Record<string, unknown> | undefined),
  };
}
