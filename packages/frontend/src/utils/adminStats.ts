export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  version?: string;
  message?: string;
}
export interface ServiceHealthGroup {
  goEngine: ServiceHealth;
  goDataService: ServiceHealth;
  nodeServer: ServiceHealth;
}
export interface ParsedDataStats {
  totalTickers: number;
  totalSizeMB: number;
  earliestDate: string;
  latestDate: string;
  marketBreakdown: Record<string, number>;
}
export interface ParsedSystemInfo {
  memoryMB: number;
  uptime: string;
}
export interface ParsedAdminStats {
  services: ServiceHealthGroup;
  dataStats: ParsedDataStats;
  system: ParsedSystemInfo;
}
export const defaultParsedAdminStats: ParsedAdminStats = {
  services: {
    goEngine: { status: 'down' },
    goDataService: { status: 'down' },
    nodeServer: { status: 'down' }
  },
  dataStats: {
    totalTickers: 0,
    totalSizeMB: 0,
    earliestDate: '-',
    latestDate: '-',
    marketBreakdown: {}
  },
  system: { memoryMB: 0, uptime: '-' }
};
export function parseMarketBreakdown(byMarket: Record<string, unknown> | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  if (!byMarket) return result;
  for (const [market, info] of Object.entries(byMarket)) {
    if (!info || typeof info !== 'object') continue;
    const m = info as Record<string, number>;
    result[market] = m.stocks || m.count || m.total || 0;
  }
  return result;
}
function mapServiceStatus(status: unknown): 'healthy' | 'degraded' | 'down' {
  if (status === 'healthy') return 'healthy';
  if (status === 'unhealthy') return 'degraded';
  return 'down';
}
function parseServiceHealth(svc: Record<string, unknown> | undefined): ServiceHealth {
  if (!svc) return { status: 'down' };
  return {
    status: mapServiceStatus(svc.status),
    latency: svc.latency_ms as number | undefined,
    version: svc.version as string | undefined,
    message: svc.error as string | undefined
  };
}
function parseServices(services: Record<string, unknown> | undefined): ServiceHealthGroup {
  const svcMap = services as Record<string, Record<string, unknown>> | undefined;
  return {
    goEngine: parseServiceHealth(svcMap?.go_engine),
    goDataService: parseServiceHealth(svcMap?.go_data_service),
    nodeServer: { status: 'healthy', latency: 5 }
  };
}
function parseDataStats(ds: Record<string, unknown> | undefined): ParsedDataStats {
  const ranges = ds?.date_ranges as Record<string, string> | undefined;
  const totalTickers = (ds?.total_tickers as number) || (ds?.universe_total as number) || 0;
  return {
    totalTickers,
    totalSizeMB: (ds?.total_size_mb as number) || 0,
    earliestDate: ranges?.earliest || '-',
    latestDate: ranges?.latest || '-',
    marketBreakdown: parseMarketBreakdown(ds?.by_market as Record<string, unknown> | undefined)
  };
}
function parseSystemInfo(sys: Record<string, unknown> | undefined): ParsedSystemInfo {
  const mem = sys?.memory as Record<string, number> | undefined;
  return {
    memoryMB: mem?.rss_mb || 0,
    uptime: (sys?.uptime_formatted as string) || '-'
  };
}
export function parseAdminStats(raw: unknown): ParsedAdminStats {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    services: parseServices(d.services as Record<string, unknown> | undefined),
    dataStats: parseDataStats(d.data_stats as Record<string, unknown> | undefined),
    system: parseSystemInfo(d.system as Record<string, unknown> | undefined)
  };
}
