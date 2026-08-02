import client from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Request } from 'express';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const gauge = (name: string, help: string, labelNames: string[] = []): client.Gauge =>
  new client.Gauge({ name, help, labelNames, registers: [register] });
const counter = (name: string, help: string, labelNames: string[] = []): client.Counter =>
  new client.Counter({ name, help, labelNames, registers: [register] });
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

export const eventLoopLagSeconds = gauge(
  'node_eventloop_lag_seconds',
  'Event loop lag (P99) in seconds, sampled every 10s',
);
const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();
setInterval(() => {
  eventLoopLagSeconds.set(eventLoopMonitor.percentile(99) / 1e9);
  eventLoopMonitor.reset();
}, 10_000).unref();

export const circuitBreakerState = gauge(
  'circuit_breaker_state',
  'Circuit breaker state: 0=closed, 1=open, 2=halfOpen',
  ['name'],
);
export const dataServiceSemaphoreAvailable = gauge(
  'data_service_semaphore_permits_available',
  'Available permits of data-service concurrency semaphore',
  ['name'],
);
export const dataServiceSemaphoreTotal = gauge(
  'data_service_semaphore_permits_max',
  'Max permits of data-service concurrency semaphore (configured limit)',
  ['name'],
);

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

const HTTP_REQUEST_LABELS: string[] = ['method', 'route', 'status_code'];
export const httpRequestDurationMicroseconds = histogram(
  'http_request_duration_seconds',
  'Duration of HTTP requests in seconds',
  HTTP_REQUEST_LABELS,
  [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10, 30],
);
export const httpRequestsTotal = counter(
  'http_requests_total',
  'Total number of HTTP requests',
  HTTP_REQUEST_LABELS,
);
export const engineCallsTotal = counter(
  'go_engine_calls_total',
  'Total number of calls to Go engine',
  ['result'],
);
export const engineCallDuration = histogram(
  'go_engine_call_duration_seconds',
  'Duration of Go engine calls in seconds',
  ['result'],
  [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
);
// 引擎不可用次数（ADR-031 fail-closed 语义）
export const engineUnavailableTotal = counter(
  'engine_unavailable_total',
  'Total number of engine unavailable events (Go circuit breaker open/fail-closed)',
  ['reason'],
);

const backtestRequestsTotal = counter(
  'backtest_requests_total',
  'Total backtest-related API requests',
  ['endpoint', 'mode', 'status'],
);
const degradedResponsesTotal = counter(
  'degraded_responses_total',
  'Responses served in degraded mode',
  ['endpoint', 'reason'],
);
const cacheHitsTotal = counter('cache_hits_total', 'Cache hit/miss count by layer', [
  'layer',
  'result',
]);
const cacheEvictionsTotal = counter(
  'cache_evictions_total',
  'Cache evictions by level (l1 = in-process LRU capacity eviction)',
  ['level'],
);
const authFailuresTotal = counter(
  'auth_failures_total',
  'Authentication/authorization failures by endpoint and reason',
  ['endpoint', 'reason'],
);
export const apiKeysStaleCount = gauge(
  'api_keys_stale_count',
  'Active API keys not used within the staleness threshold (by is_platform_admin)',
  ['is_platform_admin'],
);
const pgPoolWaitingCount = gauge(
  'pg_pool_waiting_count',
  'Number of queued requests waiting for a pool connection',
  ['pool'],
);
const pgPoolTotalCount = gauge(
  'pg_pool_connection_count',
  'Current connections in the pool (idle + in use)',
  ['pool'],
);

function sanitizeMetricLabel(value: string, maxLength = 64, allowSlash = false): string {
  const pattern = allowSlash ? /[^a-zA-Z0-9_/-]/g : /[^a-zA-Z0-9_-]/g;
  return value.replace(pattern, '_').slice(0, maxLength);
}

// 优先 `req.baseUrl + req.route.path`，避免高基数场景将 UUID 作为标签值；
export function getRoutePattern(req: Pick<Request, 'baseUrl' | 'route' | 'path'>): string {
  if (req.route?.path) return (req.baseUrl + req.route.path).slice(0, 128);
  const normalized = (req.path || 'unknown')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/\/\d+/g, '/:id');
  return normalized.slice(0, 128);
}

export function recordBacktestRequest(
  endpoint: string,
  mode: 'sync' | 'async',
  status: 'success' | 'error' | 'timeout' | 'queue_error',
): void {
  backtestRequestsTotal.inc({ endpoint, mode, status });
}
export function recordDegradedResponse(endpoint: string, reason: string): void {
  degradedResponsesTotal.inc({ endpoint, reason: sanitizeMetricLabel(reason) });
}
export function recordCacheHit(layer: string, hit: boolean): void {
  cacheHitsTotal.inc({ layer, result: hit ? 'hit' : 'miss' });
}
export function recordCacheEviction(level: 'l1'): void {
  cacheEvictionsTotal.inc({ level });
}
export function recordAuthFailure(endpoint: string, reason: string): void {
  authFailuresTotal.inc({
    endpoint: sanitizeMetricLabel(endpoint, 128, true),
    reason: sanitizeMetricLabel(reason),
  });
}

export function registerPgPoolMetrics(
  poolName: string,
  getStats: () => { waitingCount: number; totalCount: number },
): void {
  const refresh = (): void => {
    const stats = getStats();
    pgPoolWaitingCount.set({ pool: poolName }, stats.waitingCount);
    pgPoolTotalCount.set({ pool: poolName }, stats.totalCount);
  };
  startSampler(refresh, 5_000);
}

export function recordEngineCall(success: boolean, _error?: string): void {
  engineCallsTotal.inc({ result: success ? 'success' : 'unavailable' });
}
export function recordEngineUnavailable(reason: string): void {
  engineUnavailableTotal.inc({ reason: sanitizeMetricLabel(reason) });
}

export function resetMetrics(): void {
  register.resetMetrics();
}

export const authIpLockoutCounter = counter(
  'auth_ip_lockout_total',
  'Total number of IP addresses blocked due to suspicious login activity (cross-account brute force)',
);
export const readPoolFallbackCounter = counter(
  'read_pool_fallback_total',
  'Number of times read pool fell back to write pool due to connection failure',
);
// Redis/DB 不可用时 fail-closed 路径递增
export const quotaEnforcementFailures = counter(
  'quota_enforcement_failures_total',
  'Total number of quota enforcement failures (Redis/DB unavailable, fail-closed)',
  ['quota_key', 'reason'],
);

const timescaledbChunkGauges = {
  total: gauge('timescaledb_chunk_count', 'Total number of chunks in prices hypertable'),
  compressed: gauge(
    'timescaledb_compressed_chunks',
    'Number of compressed chunks in prices hypertable',
  ),
  uncompressed: gauge(
    'timescaledb_uncompressed_chunks',
    'Number of uncompressed chunks in prices hypertable',
  ),
};
const timescaledbCompressionRatio = gauge(
  'timescaledb_compression_ratio',
  'Compression ratio of prices hypertable (after/before, lower is better)',
);
const timescaledbCaggRows = gauge(
  'timescaledb_cagg_rows',
  'Total rows in prices_monthly continuous aggregate',
);

export function registerTimescaleMetrics(
  queryFn: (sql: string) => Promise<Array<Record<string, unknown>>>,
): void {
  const setNum = (g: client.Gauge, v: unknown): void => g.set(Number(v ?? 0));
  const sample = async (): Promise<void> => {
    try {
      const chunkRows = await queryFn(`
        SELECT
          COUNT(*) AS total_chunks,
          COUNT(*) FILTER (WHERE compression_status = 'Compressed') AS compressed_chunks,
          COUNT(*) FILTER (WHERE compression_status != 'Compressed') AS uncompressed_chunks
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'prices'
      `);
      const cs = chunkRows[0];
      if (cs) {
        setNum(timescaledbChunkGauges.total, cs.total_chunks);
        setNum(timescaledbChunkGauges.compressed, cs.compressed_chunks);
        setNum(timescaledbChunkGauges.uncompressed, cs.uncompressed_chunks);
      }
      const ratioRows = await queryFn(`
        SELECT
          COALESCE(
            SUM(after_compression_total_bytes)::FLOAT
            / NULLIF(SUM(before_compression_total_bytes), 0),
            1.0
          ) AS ratio
        FROM timescaledb_information.compressed_chunk_stats
        WHERE hypertable_name = 'prices'
      `);
      const ratio = ratioRows[0]?.ratio;
      if (ratio !== undefined && ratio !== null) {
        timescaledbCompressionRatio.set(Number(ratio));
      }
      const caggRows = await queryFn(`SELECT COUNT(*) AS cnt FROM prices_monthly`);
      if (caggRows[0]?.cnt !== undefined) setNum(timescaledbCaggRows, caggRows[0].cnt);
    } catch {
      /* ignore query error */
    }
  };
  startSampler(sample, 60_000);
}

const bullmqQueueSize = gauge(
  'bullmq_queue_size',
  'Number of jobs in BullMQ queue (waiting + active + delayed)',
  ['queue'],
);

export function registerQueueMetrics(
  queues: Array<{ name: string; getJobCounts: () => Promise<Record<string, number>> }>,
): void {
  const refresh = async (): Promise<void> => {
    for (const q of queues) {
      try {
        const counts = await q.getJobCounts();
        const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
        bullmqQueueSize.set({ queue: q.name }, depth);
      } catch {
        /* ignore query error */
      }
    }
  };
  startSampler(refresh, 10_000);
}

const frontendWebVital = gauge(
  'frontend_web_vital',
  'Web Vitals from real-user monitoring (lcp/cls/inp/fcp/ttfb)',
  ['metric', 'route'],
);
const frontendApiCallDuration = histogram(
  'frontend_api_call_duration_seconds',
  'API call duration from frontend perspective (includes network latency)',
  ['endpoint', 'method', 'status_code'],
  [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
);
const frontendComponentRender = histogram(
  'frontend_component_render_duration_seconds',
  'React component render duration from Profiler',
  ['component', 'phase'],
  [0.001, 0.005, 0.01, 0.016, 0.05, 0.1, 0.5, 1],
);
const frontendPageLoad = histogram(
  'frontend_page_load_seconds',
  'Page load timing from Navigation Timing API',
  ['metric'],
  [0.1, 0.5, 1, 2, 3, 5, 10],
);

export function recordFrontendWebVital(metric: string, value: number, route?: string): void {
  frontendWebVital.set({ metric, route: route || 'unknown' }, value);
}
export function recordFrontendApiCall(
  endpoint: string,
  method: string,
  statusCode: number,
  durationMs: number,
): void {
  frontendApiCallDuration.observe(
    { endpoint: endpoint.slice(0, 128), method, status_code: String(statusCode) },
    durationMs / 1000,
  );
}
export function recordFrontendComponentRender(
  component: string,
  phase: string,
  durationMs: number,
): void {
  frontendComponentRender.observe({ component: component.slice(0, 128), phase }, durationMs / 1000);
}
export function recordFrontendPageLoad(metric: string, value: number): void {
  frontendPageLoad.observe({ metric }, value / 1000);
}

export function getPrometheusRegister(): client.Registry {
  return register;
}
