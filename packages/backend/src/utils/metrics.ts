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

/** 缓存淘汰计数（按 level 分组，目前仅 L1 进程内 LRU 容量淘汰）。 */
const cacheEvictionsTotal = new client.Counter({
  name: 'cache_evictions_total',
  help: 'Cache evictions by level (l1 = in-process LRU capacity eviction)',
  labelNames: ['level'],
  registers: [register],
});

/** 认证失败计数（按 endpoint/reason 分组）。 */
const authFailuresTotal = new client.Counter({
  name: 'auth_failures_total',
  help: 'Authentication/authorization failures by endpoint and reason',
  labelNames: ['endpoint', 'reason'],
  registers: [register],
});

/**
 * 陈旧 API Key 计数（T5 监控）：超过阈值天数未使用的有效密钥数。
 * 标签 is_platform_admin 区分平台 break-glass 密钥（应触发告警）与租户密钥。
 */
export const apiKeysStaleCount = new client.Gauge({
  name: 'api_keys_stale_count',
  help: 'Active API keys not used within the staleness threshold (by is_platform_admin)',
  labelNames: ['is_platform_admin'],
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
 * @param layer - 缓存层标识（redis_l2_cache / backtest_result_cache / price_cache）
 * @param hit - 是否命中
 */
export function recordCacheHit(layer: string, hit: boolean): void {
  cacheHitsTotal.inc({ layer, result: hit ? 'hit' : 'miss' });
}

/**
 * 记录缓存淘汰（L1 进程内 LRU 因容量上限淘汰条目时调用）。
 *
 * @param level - 缓存层级，目前仅 'l1'
 */
export function recordCacheEviction(level: 'l1'): void {
  cacheEvictionsTotal.inc({ level });
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

// ─── 安全指标（等保三级入侵防范） ───

/** IP 维度登录封锁计数（等保三级 8.1.4 b) 入侵检测，P0-05）。 */
export const authIpLockoutCounter = new client.Counter({
  name: 'auth_ip_lockout_total',
  help: 'Total number of IP addresses blocked due to suspicious login activity (cross-account brute force)',
  registers: [register],
});

// ─── 读写分离指标（P1-02 T6） ───

/** 只读副本降级到主库的次数（P1-02 T8，副本不可用时自动降级）。 */
export const readPoolFallbackCounter = new client.Counter({
  name: 'read_pool_fallback_total',
  help: 'Number of times read pool fell back to write pool due to connection failure',
  registers: [register],
});

// ─── 配额指标（P0-04 fail-closed） ───

/** 配额执行失败计数（按 quota_key/reason 分组，Redis/DB 不可用时递增）。 */
export const quotaEnforcementFailures = new client.Counter({
  name: 'quota_enforcement_failures_total',
  help: 'Total number of quota enforcement failures (Redis/DB unavailable, fail-closed)',
  labelNames: ['quota_key', 'reason'],
  registers: [register],
});

// ─── TimescaleDB 指标（P1-01 T8） ───

/** TimescaleDB 压缩 chunk 数量。@internal 测试直接访问 Gauge */
export const timescaledbCompressedChunks = new client.Gauge({
  name: 'timescaledb_compressed_chunks',
  help: 'Number of compressed chunks in prices hypertable',
  registers: [register],
});

/** TimescaleDB 未压缩 chunk 数量。@internal 测试直接访问 Gauge */
export const timescaledbUncompressedChunks = new client.Gauge({
  name: 'timescaledb_uncompressed_chunks',
  help: 'Number of uncompressed chunks in prices hypertable',
  registers: [register],
});

/** TimescaleDB 压缩率（0-1，压缩后/压缩前）。@internal 测试直接访问 Gauge */
export const timescaledbCompressionRatio = new client.Gauge({
  name: 'timescaledb_compression_ratio',
  help: 'Compression ratio of prices hypertable (after/before, lower is better)',
  registers: [register],
});

/** prices_monthly CAGG 行数（验证回填完成度）。@internal 测试直接访问 Gauge */
export const timescaledbCaggRows = new client.Gauge({
  name: 'timescaledb_cagg_rows',
  help: 'Total rows in prices_monthly continuous aggregate',
  registers: [register],
});

/** TimescaleDB chunk 总数。@internal 测试直接访问 Gauge */
export const timescaledbChunkCount = new client.Gauge({
  name: 'timescaledb_chunk_count',
  help: 'Total number of chunks in prices hypertable',
  registers: [register],
});

/** TimescaleDB 指标采集间隔（毫秒）。 */
const TIMESCALE_METRICS_INTERVAL_MS = 60_000;

/**
 * 注册 TimescaleDB 指标采集器，定期查询元数据视图更新 Gauge。
 *
 * 使用回调函数模式避免与 pool.ts 的循环依赖（pool.ts 导入 metrics.ts）。
 * 调用方在 server.ts 中传入查询函数：
 *
 * ```typescript
 * import { getReadPool } from './db/pool.js';
 * registerTimescaleMetrics(async (sql) => {
 *   const { rows } = await getReadPool().query(sql);
 *   return rows;
 * });
 * ```
 *
 * @param queryFn - 异步查询函数，接收 SQL 返回行数组
 */
export function registerTimescaleMetrics(
  queryFn: (sql: string) => Promise<Array<Record<string, unknown>>>,
): void {
  const sample = async (): Promise<void> => {
    try {
      // chunk 压缩统计
      const chunkRows = await queryFn(`
        SELECT
          COUNT(*) AS total_chunks,
          COUNT(*) FILTER (WHERE compression_status = 'Compressed') AS compressed_chunks,
          COUNT(*) FILTER (WHERE compression_status != 'Compressed') AS uncompressed_chunks
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'prices'
      `);
      const chunkStats = chunkRows[0];
      if (chunkStats) {
        timescaledbChunkCount.set(Number(chunkStats.total_chunks ?? 0));
        timescaledbCompressedChunks.set(Number(chunkStats.compressed_chunks ?? 0));
        timescaledbUncompressedChunks.set(Number(chunkStats.uncompressed_chunks ?? 0));
      }

      // 压缩率
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

      // CAGG 行数
      const caggRows = await queryFn(`SELECT COUNT(*) AS cnt FROM prices_monthly`);
      if (caggRows[0]?.cnt !== undefined) {
        timescaledbCaggRows.set(Number(caggRows[0].cnt));
      }
    } catch {
      // TimescaleDB 未安装或表不存在时静默跳过（开发环境可能未启用）
    }
  };

  sample();
  setInterval(sample, TIMESCALE_METRICS_INTERVAL_MS).unref();
}

/** 返回 Prometheus register 实例，用于 /metrics 端点。 */
export function getPrometheusRegister(): client.Registry {
  return register;
}
