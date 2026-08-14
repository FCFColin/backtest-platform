type ServiceStatus = 'healthy' | 'degraded' | 'down';

interface ServiceDef {
  name: string;
  url: string;
  apiKey: string;
  defaultStatus: ServiceStatus;
}
const SERVICE_DEFS: readonly ServiceDef[] = [
  {
    name: 'Go Engine',
    url: 'http://127.0.0.1:15004',
    apiKey: 'go_engine',
    defaultStatus: 'down',
  },
  {
    name: 'Go Data Service',
    url: 'http://127.0.0.1:3003',
    apiKey: 'go_data_service',
    defaultStatus: 'down',
  },
  {
    name: 'Node Service',
    url: 'http://127.0.0.1:3001',
    apiKey: 'nodeServer',
    // Node 是管理接口的宿主，能返回响应即健康；不伪造延迟指标
    defaultStatus: 'healthy',
  },
];

export interface ServiceHealthView {
  name: string;
  url: string;
  status: ServiceStatus;
  latency: number;
  version?: string;
  message?: string;
}
function mapServiceStatus(status: unknown): 'healthy' | 'degraded' | 'down' {
  if (status === 'healthy') return 'healthy';
  if (status === 'unhealthy') return 'degraded';
  return 'down';
}
export function buildServiceHealths(d: Record<string, unknown>): ServiceHealthView[] {
  const svc = d.services as Record<string, Record<string, unknown>> | undefined;
  return SERVICE_DEFS.map((def) => {
    const raw = svc?.[def.apiKey];
    return raw
      ? {
          name: def.name,
          url: def.url,
          status: mapServiceStatus(raw.status),
          latency: (raw.latency_ms as number) || 0,
          version: raw.version as string | undefined,
          message: raw.error as string | undefined,
        }
      : { name: def.name, url: def.url, status: def.defaultStatus, latency: 0 };
  });
}

interface ParsedDataStats {
  totalTickers: number;
  totalSizeMB: number;
  earliestDate: string;
  latestDate: string;
  marketBreakdown: Record<string, number>;
}
interface ParsedSystemInfo {
  memoryMB: number;
  uptime: string;
}
export interface ParsedAdminStats {
  services: ServiceHealthView[];
  dataStats: ParsedDataStats;
  system: ParsedSystemInfo;
}
export const defaultParsedAdminStats: ParsedAdminStats = {
  services: buildServiceHealths({}),
  dataStats: {
    totalTickers: 0,
    totalSizeMB: 0,
    earliestDate: '-',
    latestDate: '-',
    marketBreakdown: {},
  },
  system: { memoryMB: 0, uptime: '-' },
};
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
function parseSystemInfo(sys: Record<string, unknown> | undefined): ParsedSystemInfo {
  const mem = sys?.memory as Record<string, number> | undefined;
  return {
    memoryMB: mem?.rss_mb || 0,
    uptime: (sys?.uptime_formatted as string) || '-',
  };
}
export function parseAdminStats(raw: unknown): ParsedAdminStats {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    services: buildServiceHealths(d),
    dataStats: parseDataStats(d.data_stats as Record<string, unknown> | undefined),
    system: parseSystemInfo(d.system as Record<string, unknown> | undefined),
  };
}
