import client from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Request } from 'express';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const gauge = (name: string, help: string, labelNames: string[] = []): client.Gauge =>
  new client.Gauge({ name, help, labelNames, registers: [register] });
const counter = (name: string, help: string, labelNames: readonly string[] = []): client.Counter =>
  new client.Counter({ name, help, labelNames: [...labelNames], registers: [register] });
const histogram = (
  name: string,
  help: string,
  labelNames: string[],
  buckets: number[],
): client.Histogram =>
  new client.Histogram({ name, help, labelNames, buckets, registers: [register] });

function startSampler(fn: () => void | Promise<void>, intervalMs: number): void {
  void fn();
  setInterval(fn, intervalMs).unref();
}

const GAUGE_DEFS = {
  node_eventloop_lag_seconds: ['Event loop lag (P99) in seconds, sampled every 10s', []],
  circuit_breaker_state: ['Circuit breaker state: 0=closed, 1=open, 2=halfOpen', ['name']],
  data_service_semaphore_permits_available: [
    'Available permits of data-service concurrency semaphore',
    ['name'],
  ],
  data_service_semaphore_permits_max: [
    'Max permits of data-service concurrency semaphore (configured limit)',
    ['name'],
  ],
  api_keys_stale_count: [
    'Active API keys not used within the staleness threshold (by is_platform_admin)',
    ['is_platform_admin'],
  ],
  bullmq_queue_size: ['Number of jobs in BullMQ queue (waiting + active + delayed)', ['queue']],
} as const;
const gauges = Object.fromEntries(
  Object.entries(GAUGE_DEFS).map(([n, [h, l]]) => [n, gauge(n, h, [...l])]),
) as Record<keyof typeof GAUGE_DEFS, client.Gauge>;
export const eventLoopLagSeconds = gauges.node_eventloop_lag_seconds;
export const circuitBreakerState = gauges.circuit_breaker_state;
export const dataServiceSemaphoreAvailable = gauges.data_service_semaphore_permits_available;
export const dataServiceSemaphoreTotal = gauges.data_service_semaphore_permits_max;
export const apiKeysStaleCount = gauges.api_keys_stale_count;
const bullmqQueueSize = gauges.bullmq_queue_size;
const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();
setInterval(() => {
  eventLoopLagSeconds.set(eventLoopMonitor.percentile(99) / 1e9);
  eventLoopMonitor.reset();
}, 10_000).unref();

export function registerCircuitBreakerMetrics(
  name: string,
  breaker: {
    on(event: 'open', cb: () => void): unknown;
    on(event: 'halfOpen', cb: () => void): unknown;
    on(event: 'close', cb: () => void): unknown;
  },
): void {
  breaker.on('open', () => circuitBreakerState.set({ name }, 1));
  breaker.on('halfOpen', () => circuitBreakerState.set({ name }, 2));
  breaker.on('close', () => circuitBreakerState.set({ name }, 0));
  circuitBreakerState.set({ name }, 0);
}

export function registerSemaphoreMetrics(
  name: string,
  total: number,
  getAvailable: () => number,
): void {
  dataServiceSemaphoreTotal.set({ name }, total);
  startSampler(() => dataServiceSemaphoreAvailable.set({ name }, getAvailable()), 5_000);
}

const HTTP_LABELS = ['method', 'route', 'status_code'] as const;
export const httpRequestDurationMicroseconds = histogram(
  'http_request_duration_seconds',
  'Duration of HTTP requests in seconds',
  [...HTTP_LABELS],
  [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10, 30],
);
export const engineCallDuration = histogram(
  'go_engine_call_duration_seconds',
  'Duration of Go engine calls in seconds',
  ['result'],
  [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
);

const COUNTER_DEFS = {
  http_requests_total: { help: 'Total number of HTTP requests', labels: [...HTTP_LABELS] },
  go_engine_calls_total: { help: 'Total number of calls to Go engine', labels: ['result'] },
  engine_unavailable_total: {
    help: 'Total number of engine unavailable events (Go circuit breaker open/fail-closed)',
    labels: ['reason'],
  },
  backtest_requests: {
    help: 'Total backtest-related API requests',
    labels: ['endpoint', 'mode', 'status'],
  },
  degraded_responses: { help: 'Responses served in degraded mode', labels: ['endpoint', 'reason'] },
  cache_hits: { help: 'Cache hit/miss count by layer', labels: ['layer', 'result'] },
  cache_evictions: {
    help: 'Cache evictions by level (l1 = in-process LRU capacity eviction)',
    labels: ['level'],
  },
  auth_failures: {
    help: 'Authentication/authorization failures by endpoint and reason',
    labels: ['endpoint', 'reason'],
  },
  auth_ip_lockout_total: {
    help: 'Total number of IP addresses blocked due to suspicious login activity',
    labels: [],
  },
  read_pool_fallback_total: {
    help: 'Number of times read pool fell back to write pool due to connection failure',
    labels: [],
  },
  quota_enforcement_failures_total: {
    help: 'Total number of quota enforcement failures (Redis/DB unavailable, fail-closed)',
    labels: ['quota_key', 'reason'],
  },
  audit_outbox_write_failures_total: {
    help: 'Total number of audit outbox event write failures (non-transactional path)',
    labels: [],
  },
} as const;
const ctr = Object.fromEntries(
  Object.entries(COUNTER_DEFS).map(([name, def]) => [name, counter(name, def.help, def.labels)]),
) as Record<keyof typeof COUNTER_DEFS, client.Counter>;
export const httpRequestsTotal = ctr.http_requests_total;
export const engineCallsTotal = ctr.go_engine_calls_total;
export const engineUnavailableTotal = ctr.engine_unavailable_total;
export const authIpLockoutCounter = ctr.auth_ip_lockout_total;
export const quotaEnforcementFailures = ctr.quota_enforcement_failures_total;
export const auditOutboxWriteFailures = ctr.audit_outbox_write_failures_total;

function sanitizeMetricLabel(value: string, maxLength = 64, allowSlash = false): string {
  const pattern = allowSlash ? /[^a-zA-Z0-9_/-]/g : /[^a-zA-Z0-9_-]/g;
  return value.replace(pattern, '_').slice(0, maxLength);
}
export function getRoutePattern(req: Pick<Request, 'baseUrl' | 'route' | 'path'>): string {
  if (req.route?.path) return (req.baseUrl + req.route.path).slice(0, 128);
  return (req.path || 'unknown')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/\/\d+/g, '/:id')
    .slice(0, 128);
}

export const recordBacktestRequest = (
  endpoint: string,
  mode: 'sync' | 'async',
  status: 'success' | 'error' | 'timeout' | 'queue_error',
): void => ctr.backtest_requests.inc({ endpoint, mode, status });
export const recordDegradedResponse = (endpoint: string, reason: string): void =>
  ctr.degraded_responses.inc({ endpoint, reason: sanitizeMetricLabel(reason) });
export const recordCacheHit = (layer: string, hit: boolean): void =>
  ctr.cache_hits.inc({ layer, result: hit ? 'hit' : 'miss' });
export const recordCacheEviction = (level: 'l1'): void => ctr.cache_evictions.inc({ level });
export const recordAuthFailure = (endpoint: string, reason: string): void =>
  ctr.auth_failures.inc({
    endpoint: sanitizeMetricLabel(endpoint, 128, true),
    reason: sanitizeMetricLabel(reason),
  });

export function registerPgPoolMetrics(
  poolName: string,
  getStats: () => { waitingCount: number; totalCount: number },
): void {
  const waiting = gauge(
    'pg_pool_waiting_count',
    'Number of queued requests waiting for a pool connection',
    ['pool'],
  );
  const total = gauge(
    'pg_pool_connection_count',
    'Current connections in the pool (idle + in use)',
    ['pool'],
  );
  startSampler(() => {
    const s = getStats();
    waiting.set({ pool: poolName }, s.waitingCount);
    total.set({ pool: poolName }, s.totalCount);
  }, 5_000);
}

export const recordEngineCall = (success: boolean, _error?: string): void =>
  engineCallsTotal.inc({ result: success ? 'success' : 'unavailable' });
export const recordEngineUnavailable = (reason: string): void =>
  engineUnavailableTotal.inc({ reason: sanitizeMetricLabel(reason) });
export const resetMetrics = (): void => register.resetMetrics();

const TS_GAUGE_DEFS: Record<string, [string, string]> = {
  chunk_total: ['timescaledb_chunk_count', 'Total number of chunks in prices hypertable'],
  chunk_compressed: [
    'timescaledb_compressed_chunks',
    'Number of compressed chunks in prices hypertable',
  ],
  chunk_uncompressed: [
    'timescaledb_uncompressed_chunks',
    'Number of uncompressed chunks in prices hypertable',
  ],
  compression_ratio: [
    'timescaledb_compression_ratio',
    'Compression ratio of prices hypertable (after/before, lower is better)',
  ],
  cagg_rows: ['timescaledb_cagg_rows', 'Total rows in prices_monthly continuous aggregate'],
};
const tsGauges = Object.fromEntries(
  Object.entries(TS_GAUGE_DEFS).map(([k, [n, h]]) => [k, gauge(n, h)]),
) as Record<string, client.Gauge>;

export function registerTimescaleMetrics(
  queryFn: (sql: string) => Promise<Array<Record<string, unknown>>>,
): void {
  const setNum = (g: client.Gauge, v: unknown): void => g.set(Number(v ?? 0));
  startSampler(async () => {
    try {
      const chunkRows = await queryFn(
        `SELECT COUNT(*) AS total_chunks, COUNT(*) FILTER (WHERE compression_status = 'Compressed') AS compressed_chunks, COUNT(*) FILTER (WHERE compression_status != 'Compressed') AS uncompressed_chunks FROM timescaledb_information.chunks WHERE hypertable_name = 'prices'`,
      );
      const cs = chunkRows[0];
      if (cs) {
        setNum(tsGauges.chunk_total, cs.total_chunks);
        setNum(tsGauges.chunk_compressed, cs.compressed_chunks);
        setNum(tsGauges.chunk_uncompressed, cs.uncompressed_chunks);
      }
      const ratioRows = await queryFn(
        `SELECT COALESCE(SUM(after_compression_total_bytes)::FLOAT / NULLIF(SUM(before_compression_total_bytes), 0), 1.0) AS ratio FROM timescaledb_information.compressed_chunk_stats WHERE hypertable_name = 'prices'`,
      );
      const ratio = ratioRows[0]?.ratio;
      if (ratio !== undefined && ratio !== null) tsGauges.compression_ratio.set(Number(ratio));
      const caggRows = await queryFn(`SELECT COUNT(*) AS cnt FROM prices_monthly`);
      if (caggRows[0]?.cnt !== undefined) setNum(tsGauges.cagg_rows, caggRows[0].cnt);
    } catch {
      /* ignore query error */
    }
  }, 60_000);
}

export function registerQueueMetrics(
  queues: Array<{ name: string; getJobCounts: () => Promise<Record<string, number>> }>,
): void {
  startSampler(async () => {
    for (const q of queues) {
      try {
        const counts = await q.getJobCounts();
        bullmqQueueSize.set(
          { queue: q.name },
          (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
        );
      } catch {
        /* ignore */
      }
    }
  }, 10_000);
}

const FE_HIST_DEFS: Record<string, [string, string, string[], number[]]> = {
  apiCall: [
    'frontend_api_call_duration_seconds',
    'API call duration from frontend perspective (includes network latency)',
    ['endpoint', 'method', 'status_code'],
    [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  ],
  componentRender: [
    'frontend_component_render_duration_seconds',
    'React component render duration from Profiler',
    ['component', 'phase'],
    [0.001, 0.005, 0.01, 0.016, 0.05, 0.1, 0.5, 1],
  ],
  pageLoad: [
    'frontend_page_load_seconds',
    'Page load timing from Navigation Timing API',
    ['metric'],
    [0.1, 0.5, 1, 2, 3, 5, 10],
  ],
};
const fe = {
  webVital: gauge(
    'frontend_web_vital',
    'Web Vitals from real-user monitoring (lcp/cls/inp/fcp/ttfb)',
    ['metric', 'route'],
  ),
  ...Object.fromEntries(
    Object.entries(FE_HIST_DEFS).map(([k, [n, h, l, b]]) => [k, histogram(n, h, [...l], [...b])]),
  ),
} as Record<string, client.Gauge | client.Histogram>;
export const recordFrontendWebVital = (metric: string, value: number, route?: string): void =>
  (fe.webVital as client.Gauge).set({ metric, route: route || 'unknown' }, value);
export const recordFrontendApiCall = (
  endpoint: string,
  method: string,
  statusCode: number,
  durationMs: number,
): void =>
  (fe.apiCall as client.Histogram).observe(
    { endpoint: endpoint.slice(0, 128), method, status_code: String(statusCode) },
    durationMs / 1000,
  );
export const recordFrontendComponentRender = (
  component: string,
  phase: string,
  durationMs: number,
): void =>
  (fe.componentRender as client.Histogram).observe(
    { component: component.slice(0, 128), phase },
    durationMs / 1000,
  );
export const recordFrontendPageLoad = (metric: string, value: number): void =>
  (fe.pageLoad as client.Histogram).observe({ metric }, value / 1000);

export function getPrometheusRegister(): client.Registry {
  return register;
}
