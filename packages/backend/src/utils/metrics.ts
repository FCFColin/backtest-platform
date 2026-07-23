/**
 * Prometheus 指标模块（prom-client）。
 * 暴露标准 Prometheus 格式指标供 /metrics 端点抓取。
 */

import client from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

// ─── Saturation 指标（Google SRE 黄金信号） ───

/** 事件循环延迟（P99 秒），每 10s 采样。@internal 测试直接访问 Gauge */
export const eventLoopLagSeconds = new client.Gauge({
  name: 'node_eventloop_lag_seconds',
  help: 'Event loop lag (P99) in seconds, sampled every 10s',
  registers: [register],
});

const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();

function sampleEventLoopLag(): void {
  eventLoopLagSeconds.set(eventLoopMonitor.percentile(99) / 1e9);
}

setInterval(sampleEventLoopLag, 10_000).unref();

/** 熔断器状态：0=closed, 1=open, 2=halfOpen。@internal 测试直接访问 Gauge */
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state: 0=closed, 1=open, 2=halfOpen',
  labelNames: ['name'],
  registers: [register],
});

/** 数据服务并发信号量可用许可数（T-25 重命名）。@internal 测试直接访问 Gauge */
export const dataServiceSemaphoreAvailable = new client.Gauge({
  name: 'data_service_semaphore_permits_available',
  help: 'Available permits of data-service concurrency semaphore',
  labelNames: ['name'],
  registers: [register],
});

/** @internal 测试直接访问 Gauge */
export const dataServiceSemaphoreTotal = new client.Gauge({
  name: 'data_service_semaphore_permits_total',
  help: 'Total permits of data-service concurrency semaphore (configured max)',
  labelNames: ['name'],
  registers: [register],
});

/** 注册熔断器状态采集器，将 closed/open/halfOpen 事件映射为 0/1/2。 */
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

/** 信号量采集刷新间隔（毫秒）。 */
const SEMAPHORE_REFRESH_INTERVAL_MS = 5_000;

/** 注册数据服务信号量采集器，定时刷新动态许可数。 */
export function registerSemaphoreMetrics(
  name: string,
  total: number,
  getAvailable: () => number,
): void {
  dataServiceSemaphoreTotal.set({ name }, total);
  dataServiceSemaphoreAvailable.set({ name }, getAvailable());
  setInterval(() => {
    dataServiceSemaphoreAvailable.set({ name }, getAvailable());
  }, SEMAPHORE_REFRESH_INTERVAL_MS).unref();
}

// ─── HTTP 请求指标（Traffic + Latency + Errors） ───

/** HTTP 请求耗时直方图（P50/P95/P99）。 */
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

/** HTTP 请求总数计数器（按 method/route/status_code 分组）。 */
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ─── Go 引擎指标 ───

/** Go 引擎调用总数（result: success/unavailable）。 */
export const engineCallsTotal = new client.Counter({
  name: 'go_engine_calls_total',
  help: 'Total number of calls to Go engine',
  labelNames: ['result'],
  registers: [register],
});

/** Go 引擎调用耗时。 */
export const engineCallDuration = new client.Histogram({
  name: 'go_engine_call_duration_seconds',
  help: 'Duration of Go engine calls in seconds',
  labelNames: ['result'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

/** 引擎不可用次数（ADR-031 fail-closed 语义）。 */
export const engineUnavailableTotal = new client.Counter({
  name: 'engine_unavailable_total',
  help: 'Total number of engine unavailable events (Go circuit breaker open/fail-closed)',
  labelNames: ['reason'],
  registers: [register],
});

// ─── 业务指标（T-B3） ───

/** 回测请求总数（按 endpoint/mode/status 分组）。 */
const backtestRequestsTotal = new client.Counter({
  name: 'backtest_requests_total',
  help: 'Total backtest-related API requests',
  labelNames: ['endpoint', 'mode', 'status'],
  registers: [register],
});

/** 降级响应计数（按 endpoint/reason 分组）。 */
const degradedResponsesTotal = new client.Counter({
  name: 'degraded_responses_total',
  help: 'Responses served in degraded mode',
  labelNames: ['endpoint', 'reason'],
  registers: [register],
});

/** 缓存命中计数（按 layer/result 分组）。 */
const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Cache hit/miss count by layer',
  labelNames: ['layer', 'result'],
  registers: [register],
});

/** 认证失败计数（按 endpoint/reason 分组）。 */
const authFailuresTotal = new client.Counter({
  name: 'auth_failures_total',
  help: 'Authentication/authorization failures by endpoint and reason',
  labelNames: ['endpoint', 'reason'],
  registers: [register],
});

/** PostgreSQL 连接池等待队列长度（T-B6 Saturation）。 */
const pgPoolWaitingCount = new client.Gauge({
  name: 'pg_pool_waiting_count',
  help: 'Number of queued requests waiting for a pool connection',
  labelNames: ['pool'],
  registers: [register],
});

const pgPoolTotalCount = new client.Gauge({
  name: 'pg_pool_total_connections',
  help: 'Total connections in the pool (idle + in use)',
  labelNames: ['pool'],
  registers: [register],
});

// ─── 共享 sanitization helper ───

/**
 * 清洗指标标签值：替换非法字符为 `_`，截断到 maxLength。
 *
 * @param value - 原始标签值
 * @param maxLength - 最大长度，默认 64
 * @param allowSlash - 是否允许 `/`（路由型标签如 endpoint 需要）
 */
function sanitizeMetricLabel(value: string, maxLength = 64, allowSlash = false): string {
  const pattern = allowSlash ? /[^a-zA-Z0-9_/-]/g : /[^a-zA-Z0-9_-]/g;
  return value.replace(pattern, '_').slice(0, maxLength);
}

// ─── 记录函数 ───

/** 记录回测请求（业务指标封装）。 */
export function recordBacktestRequest(
  endpoint: string,
  mode: 'sync' | 'async',
  status: 'success' | 'error' | 'timeout',
): void {
  backtestRequestsTotal.inc({ endpoint, mode, status });
}

/** 记录降级响应。 */
export function recordDegradedResponse(endpoint: string, reason: string): void {
  degradedResponsesTotal.inc({ endpoint, reason: sanitizeMetricLabel(reason) });
}

/**
 * 记录缓存命中/未命中。
 *
 * @param layer - 缓存层标识（file_cache / backtest_result_cache / price_cache）
 * @param hit - 是否命中
 */
export function recordCacheHit(layer: string, hit: boolean): void {
  cacheHitsTotal.inc({ layer, result: hit ? 'hit' : 'miss' });
}

/**
 * 记录认证/鉴权失败。
 *
 * @param endpoint - 请求路径或端点标识
 * @param reason - 失败原因（snake_case，如 invalid_token / insufficient_permission）
 */
export function recordAuthFailure(endpoint: string, reason: string): void {
  authFailuresTotal.inc({
    endpoint: sanitizeMetricLabel(endpoint, 128, true),
    reason: sanitizeMetricLabel(reason),
  });
}

/**
 * 注册 PostgreSQL 连接池饱和度采集（T-B6）。
 *
 * @param poolName - 池标识 primary / read
 * @param getStats - 返回 node-postgres Pool 统计
 */
export function registerPgPoolMetrics(
  poolName: string,
  getStats: () => { waitingCount: number; totalCount: number },
): void {
  const refresh = (): void => {
    const stats = getStats();
    pgPoolWaitingCount.set({ pool: poolName }, stats.waitingCount);
    pgPoolTotalCount.set({ pool: poolName }, stats.totalCount);
  };
  refresh();
  setInterval(refresh, 5_000).unref();
}

// ─── 兼容旧接口（渐进迁移） ───

/** 记录引擎调用结果。 */
export function recordEngineCall(success: boolean, error?: string): void {
  if (success) {
    engineCallsTotal.inc({ result: 'success' });
  } else {
    engineCallsTotal.inc({ result: 'unavailable' });
    if (error) {
      engineUnavailableTotal.inc({ reason: sanitizeMetricLabel(error) });
    }
  }
}

/**
 * 记录引擎不可用事件（Go 引擎熔断/调用失败）。
 *
 * @param reason - 不可用原因（如 go_circuit_breaker_open）
 */
export function recordEngineUnavailable(reason: string): void {
  engineUnavailableTotal.inc({ reason: sanitizeMetricLabel(reason) });
}

/**
 * 重置指标（仅用于测试）。
 * @internal 测试专用：生产代码零外部引用，仅单元测试直接调用
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

/** 返回 Prometheus register 实例，用于 /metrics 端点。 */
export function getPrometheusRegister(): client.Registry {
  return register;
}
