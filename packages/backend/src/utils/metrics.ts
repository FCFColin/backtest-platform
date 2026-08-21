import client from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Request } from 'express';
const R = new client.Registry();
client.collectDefaultMetrics({ register: R });
function E<T extends client.Gauge | client.Counter | client.Histogram>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prom-client ctor
  C: new (...a: any[]) => T,
  cfg: Record<string, unknown>,
): T {
  return (
    (R.getSingleMetric(cfg.name as string) as T | undefined) ?? new C({ ...cfg, registers: [R] })
  );
}
const g = (n: string, h: string, l: string[] = []): client.Gauge =>
  E(client.Gauge, { name: n, help: h, labelNames: l });
const c = (n: string, h: string, l: readonly string[] = []): client.Counter =>
  E(client.Counter, { name: n, help: h, labelNames: [...l] });
const hs = (n: string, h: string, l: string[], b: number[]): client.Histogram =>
  E(client.Histogram, { name: n, help: h, labelNames: l, buckets: b });
const sample = (fn: () => void | Promise<void>, ms: number): void => {
  void fn();
  setInterval(fn, ms).unref();
};
const G_DEFS = {
  node_eventloop_lag_seconds: ['Event loop lag P99 (s)', []],
  circuit_breaker_state: ['Circuit breaker state 0/1/2', ['name']],
  data_service_semaphore_permits_available: ['Available data-service permits', ['name']],
  data_service_semaphore_permits_max: ['Max data-service permits', ['name']],
  api_keys_stale_count: ['Stale API keys by admin flag', ['is_platform_admin']],
  bullmq_queue_size: ['BullMQ queue jobs (waiting+active+delayed)', ['queue']],
} as const;
const G = Object.fromEntries(
  Object.entries(G_DEFS).map(([n, [h, l]]) => [n, g(n, h, [...l])]),
) as Record<keyof typeof G_DEFS, client.Gauge>;
export const eventLoopLagSeconds = G.node_eventloop_lag_seconds;
export const circuitBreakerState = G.circuit_breaker_state;
export const dataServiceSemaphoreAvailable = G.data_service_semaphore_permits_available;
export const dataServiceSemaphoreTotal = G.data_service_semaphore_permits_max;
export const apiKeysStaleCount = G.api_keys_stale_count;
const bullmqQueueSize = G.bullmq_queue_size;
const eld = monitorEventLoopDelay({ resolution: 20 });
eld.enable();
setInterval(() => {
  eventLoopLagSeconds.set(eld.percentile(99) / 1e9);
  eld.reset();
}, 10_000).unref();
type Breaker = { on(e: 'open' | 'halfOpen' | 'close', cb: () => void): unknown };
export function registerCircuitBreakerMetrics(name: string, b: Breaker): void {
  b.on('open', () => circuitBreakerState.set({ name }, 1));
  b.on('halfOpen', () => circuitBreakerState.set({ name }, 2));
  b.on('close', () => circuitBreakerState.set({ name }, 0));
  circuitBreakerState.set({ name }, 0);
}
export function registerSemaphoreMetrics(name: string, total: number, getAv: () => number): void {
  dataServiceSemaphoreTotal.set({ name }, total);
  sample(() => dataServiceSemaphoreAvailable.set({ name }, getAv()), 5_000);
}
const HTTP_L = ['method', 'route', 'status_code'] as const;
export const httpRequestDurationMicroseconds = hs(
  'http_request_duration_seconds',
  'HTTP request duration (s)',
  [...HTTP_L],
  [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10, 30],
);
export const engineCallDuration = hs(
  'go_engine_call_duration_seconds',
  'Go engine call duration (s)',
  ['result'],
  [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
);
const C_DEFS = {
  http_requests_total: ['Total HTTP requests', [...HTTP_L]],
  go_engine_calls_total: ['Total Go engine calls', ['result']],
  engine_unavailable_total: ['Engine unavailable events', ['reason']],
  backtest_requests: ['Backtest API requests', ['endpoint', 'mode', 'status']],
  degraded_responses: ['Degraded responses', ['endpoint', 'reason']],
  cache_hits: ['Cache hit/miss', ['layer', 'result']],
  cache_evictions: ['Cache evictions l1', ['level']],
  auth_failures: ['Auth failures', ['endpoint', 'reason']],
  auth_ip_lockout_total: ['IP lockouts', []],
  quota_enforcement_failures_total: ['Quota enforcement failures', ['quota_key', 'reason']],
  audit_outbox_write_failures_total: ['Audit outbox write failures', []],
  usage_write_failures_total: ['Usage write failures', ['metric']],
  dlq_transfers_total: ['Dead letter transfers', ['queue']],
} as const;
const C = Object.fromEntries(
  Object.entries(C_DEFS).map(([n, [h, l]]) => [n, c(n, h, l as readonly string[])]),
) as Record<keyof typeof C_DEFS, client.Counter>;
export const httpRequestsTotal = C.http_requests_total;
export const engineCallsTotal = C.go_engine_calls_total;
export const engineUnavailableTotal = C.engine_unavailable_total;
export const authIpLockoutCounter = C.auth_ip_lockout_total;
export const quotaEnforcementFailures = C.quota_enforcement_failures_total;
export const auditOutboxWriteFailures = C.audit_outbox_write_failures_total;
export const usageWriteFailures = C.usage_write_failures_total;
export const recordDlqTransfer = (q: string): void =>
  C.dlq_transfers_total.inc({ queue: sLabel(q) });
const sLabel = (v: string, m = 64, slash = false): string =>
  v.replace(slash ? /[^a-zA-Z0-9_/-]/g : /[^a-zA-Z0-9_-]/g, '_').slice(0, m);
export function getRoutePattern(req: Pick<Request, 'baseUrl' | 'route' | 'path'>): string {
  return req.route?.path
    ? (req.baseUrl + req.route.path).slice(0, 128)
    : (req.path || 'unknown')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
        .replace(/\/\d+/g, '/:id')
        .slice(0, 128);
}
export const recordBacktestRequest = (
  e: string,
  m: 'sync' | 'async',
  s: 'success' | 'error' | 'timeout' | 'queue_error',
): void => C.backtest_requests.inc({ endpoint: e, mode: m, status: s });
export const recordDegradedResponse = (e: string, r: string): void =>
  C.degraded_responses.inc({ endpoint: e, reason: sLabel(r) });
export const recordCacheHit = (l: string, hit: boolean): void =>
  C.cache_hits.inc({ layer: l, result: hit ? 'hit' : 'miss' });
export const recordCacheEviction = (l: 'l1'): void => C.cache_evictions.inc({ level: l });
export const recordAuthFailure = (e: string, r: string): void =>
  C.auth_failures.inc({ endpoint: sLabel(e, 128, true), reason: sLabel(r) });
export function registerPgPoolMetrics(
  pool: string,
  get: () => { waitingCount: number; totalCount: number },
): void {
  const w = g('pg_pool_waiting_count', 'Queued pool requests', ['pool']);
  const t = g('pg_pool_connection_count', 'Pool connections (idle+in-use)', ['pool']);
  sample(() => {
    const s = get();
    w.set({ pool }, s.waitingCount);
    t.set({ pool }, s.totalCount);
  }, 5_000);
}
export const recordEngineCall = (r: 'success' | 'client_error' | 'unavailable'): void =>
  engineCallsTotal.inc({ result: r });
export const recordEngineUnavailable = (r: string): void =>
  engineUnavailableTotal.inc({ reason: sLabel(r) });
const TS_DEFS: Record<string, [string, string]> = {
  chunk_total: ['timescaledb_chunk_count', 'Chunks in prices hypertable'],
  chunk_compressed: ['timescaledb_compressed_chunks', 'Compressed chunks in prices'],
  chunk_uncompressed: ['timescaledb_uncompressed_chunks', 'Uncompressed chunks in prices'],
  compression_ratio: ['timescaledb_compression_ratio', 'Compression ratio after/before'],
  cagg_rows: ['timescaledb_cagg_rows', 'Rows in prices_monthly CAGG'],
};
const TSG = Object.fromEntries(
  Object.entries(TS_DEFS).map(([k, [n, h]]) => [k, g(n, h)]),
) as Record<string, client.Gauge>;
export function registerTimescaleMetrics(
  q: (sql: string) => Promise<Array<Record<string, unknown>>>,
): void {
  sample(async () => {
    try {
      const cr = await q(
        `SELECT COUNT(*) AS total_chunks, COUNT(*) FILTER (WHERE compression_status = 'Compressed') AS compressed_chunks, COUNT(*) FILTER (WHERE compression_status != 'Compressed') AS uncompressed_chunks FROM timescaledb_information.chunks WHERE hypertable_name = 'prices'`,
      );
      const cs = cr[0];
      if (cs) {
        TSG.chunk_total.set(Number(cs.total_chunks ?? 0));
        TSG.chunk_compressed.set(Number(cs.compressed_chunks ?? 0));
        TSG.chunk_uncompressed.set(Number(cs.uncompressed_chunks ?? 0));
      }
      const rr = await q(
        `SELECT COALESCE(SUM(after_compression_total_bytes)::FLOAT / NULLIF(SUM(before_compression_total_bytes), 0), 1.0) AS ratio FROM timescaledb_information.compressed_chunk_stats WHERE hypertable_name = 'prices'`,
      );
      const ra = rr[0]?.ratio;
      if (ra !== undefined && ra !== null) TSG.compression_ratio.set(Number(ra));
      const ar = await q(`SELECT COUNT(*) AS cnt FROM prices_monthly`);
      if (ar[0]?.cnt !== undefined) TSG.cagg_rows.set(Number(ar[0].cnt ?? 0));
    } catch {
      /* ignore */
    }
  }, 60_000);
}
export function registerQueueMetrics(
  qs: Array<{ name: string; getJobCounts: () => Promise<Record<string, number>> }>,
): void {
  sample(async () => {
    for (const q of qs)
      try {
        const n = await q.getJobCounts();
        bullmqQueueSize.set(
          { queue: q.name },
          (n.waiting ?? 0) + (n.active ?? 0) + (n.delayed ?? 0),
        );
      } catch {
        /* ignore */
      }
  }, 10_000);
}
const B_A = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
const B_R = [0.001, 0.005, 0.01, 0.016, 0.05, 0.1, 0.5, 1];
const B_P = [0.1, 0.5, 1, 2, 3, 5, 10];
const FE_DEFS: Record<string, [string, string, string[], number[]]> = {
  apiCall: [
    'frontend_api_call_duration_seconds',
    'Frontend API call (s)',
    ['endpoint', 'method', 'status_code'],
    B_A,
  ],
  componentRender: [
    'frontend_component_render_duration_seconds',
    'React render (s)',
    ['component', 'phase'],
    B_R,
  ],
  pageLoad: ['frontend_page_load_seconds', 'Page load (s)', ['metric'], B_P],
};
const F = {
  webVital: g('frontend_web_vital', 'Web Vitals (lcp/cls/inp/fcp/ttfb)', ['metric']),
  ...Object.fromEntries(
    Object.entries(FE_DEFS).map(([k, [n, h, l, b]]) => [k, hs(n, h, [...l], [...b])]),
  ),
} as Record<string, client.Gauge | client.Histogram>;
const OTHER = '[other]';
const CAP = 300;
const KNOWN = {
  webVital: new Set(['lcp', 'cls', 'inp', 'fcp', 'ttfb']),
  pageLoad: new Set(['ttfb', 'fcp', 'dom_ready', 'load']),
  renderPhase: new Set(['mount', 'update']),
} as const;
const ID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$|^\d{6,}$/i;
const seen = new Set<string>();
let seenAt = Date.now();
const TTL = 60 * 60 * 1000;
const bLabel = (scope: string, raw: string): string => {
  const k = `${scope}\u0000${raw}`;
  if (seen.has(k)) return raw;
  if (!raw || seen.size >= CAP) {
    if (Date.now() - seenAt >= TTL) {
      seenAt = Date.now();
      seen.clear();
    }
    return OTHER;
  }
  seen.add(k);
  return raw;
};
const normEp = (raw: string): string =>
  raw
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+/, '')
    .split('/')
    .map((s) => (ID_RE.test(s) ? ':id' : s))
    .join('/')
    .slice(0, 128);
export const recordFrontendWebVital = (m: string, v: number): void => {
  if (!KNOWN.webVital.has(m as never)) return;
  (F.webVital as client.Gauge).set({ metric: m }, v);
};
export const recordFrontendApiCall = (e: string, m: string, s: number, d: number): void =>
  (F.apiCall as client.Histogram).observe(
    { endpoint: bLabel('apiCall', normEp(e)), method: m, status_code: String(s) },
    d / 1000,
  );
export const recordFrontendComponentRender = (c: string, p: string, d: number): void =>
  (F.componentRender as client.Histogram).observe(
    {
      component: bLabel('render', c.slice(0, 128)),
      phase: KNOWN.renderPhase.has(p as never) ? p : OTHER,
    },
    d / 1000,
  );
export const recordFrontendPageLoad = (m: string, v: number): void => {
  if (!KNOWN.pageLoad.has(m as never)) return;
  (F.pageLoad as client.Histogram).observe({ metric: m }, v / 1000);
};
export function getPrometheusRegister(): client.Registry {
  return R;
}
