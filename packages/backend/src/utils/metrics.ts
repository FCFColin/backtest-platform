/**
 * Prometheus 指标模块
 *
 * 基于 prom-client 提供标准 Prometheus 格式的指标暴露，
 * 替代原先的内存计数器方案。
 *
 * 企业理由：Prometheus 是 K8s 生态监控标准，无它则无法配置告警。
 * 原内存计数器方案：纯内存（重启归零）、无维度标签、无时间序列、
 * 无速率计算，不可用于生产监控告警。
 * 权衡：Histogram bucket 增加内存开销，但远小于业务数据。
 */

import client from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// 创建 Registry，避免与全局默认 Registry 冲突
const register = new client.Registry();

// 添加默认指标（进程 CPU/内存/GC 等）
client.collectDefaultMetrics({ register });

// ─── Saturation 指标（Google SRE 黄金信号：系统最满的资源） ───

/**
 * 事件循环延迟（秒）
 *
 * 企业理由：Node.js 单线程模型下，事件循环阻塞是性能杀手。
 * 100x 流量下事件循环延迟先于 CPU/内存饱和，是 Node 服务最关键的 saturation 指标。
 * 延迟 > 100ms 意味着请求处理被阻塞，需告警。
 *
 * 实现：perf_hooks.monitorEventLoopDelay 提供 ns 级直方图，
 * 每 10s 采样 P99 值更新 Gauge。权衡：10s 采样间隔有延迟，但开销可忽略。
 */
export const eventLoopLagSeconds = new client.Gauge({
  name: 'node_eventloop_lag_seconds',
  help: 'Event loop lag (P99) in seconds, sampled every 10s',
  registers: [register],
});

const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();

function sampleEventLoopLag(): void {
  // monitorEventLoopDelay 单位为 ns，转换为秒
  const lagNs = eventLoopMonitor.percentile(99);
  eventLoopLagSeconds.set(lagNs / 1e9);
}

// 每 10s 采样一次事件循环延迟
setInterval(sampleEventLoopLag, 10_000).unref();

/**
 * 熔断器状态 Gauge
 *
 * 企业理由：熔断器 Open 时全量降级，是可用性关键信号。
 * 0=closed（正常）、1=open（快速失败）、2=halfOpen（探测中）。
 * 配合告警：circuit_breaker_state == 1 持续 1 分钟触发告警。
 */
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state: 0=closed, 1=open, 2=halfOpen',
  labelNames: ['name'],
  registers: [register],
});

/**
 * 数据服务并发信号量许可数（T-25：从 python_* 改名为 data_service_*）
 *
 * 企业理由：ADR-008 后数据服务主路径为 Go（data-fetcher），该信号量限制的是对数据服务的
 * 并发调用，而非 Python 子进程。旧名 `python_semaphore_*` 会误导排障者去查已退役的 Python 路径。
 * 指标名应反映其当前真实语义。available 降至 0 表示并发饱和，新请求排队，P95 延迟劣化。
 */
export const dataServiceSemaphoreAvailable = new client.Gauge({
  name: 'data_service_semaphore_permits_available',
  help: 'Available permits of data-service concurrency semaphore',
  labelNames: ['name'],
  registers: [register],
});

export const dataServiceSemaphoreTotal = new client.Gauge({
  name: 'data_service_semaphore_permits_total',
  help: 'Total permits of data-service concurrency semaphore (configured max)',
  labelNames: ['name'],
  registers: [register],
});

/**
 * 注册熔断器状态采集器
 *
 * 企业理由：熔断器状态由 opossum 内部维护，需通过事件回调同步到 Gauge。
 * 此函数在熔断器创建后调用，将 closed/open/halfOpen 事件映射为 0/1/2。
 */
export function registerCircuitBreakerMetrics(
  name: string,
  // opossum 的 on 方法有事件名重载，此处用最小结构类型兼容
  breaker: {
    on(event: 'open', cb: () => void): unknown;
    on(event: 'halfOpen', cb: () => void): unknown;
    on(event: 'close', cb: () => void): unknown;
  },
): void {
  breaker.on('open', () => circuitBreakerState.set({ name }, 1));
  breaker.on('halfOpen', () => circuitBreakerState.set({ name }, 2));
  breaker.on('close', () => circuitBreakerState.set({ name }, 0));
  // 初始状态为 closed
  circuitBreakerState.set({ name }, 0);
}

/** 信号量采集刷新间隔（毫秒）：在 scrape 之间定时刷新动态许可数。 */
const SEMAPHORE_REFRESH_INTERVAL_MS = 5_000;

/**
 * 注册数据服务信号量采集器
 *
 * 企业理由：信号量许可数为动态值，需通过定时刷新在 scrape 时反映最新值。
 */
export function registerSemaphoreMetrics(
  name: string,
  total: number,
  getAvailable: () => number,
): void {
  dataServiceSemaphoreTotal.set({ name }, total);
  dataServiceSemaphoreAvailable.set({ name }, getAvailable());
  // prom-client Gauge 不支持 per-label collect，改用定时刷新
  setInterval(() => {
    dataServiceSemaphoreAvailable.set({ name }, getAvailable());
  }, SEMAPHORE_REFRESH_INTERVAL_MS).unref();
}

// ─── HTTP 请求指标（黄金信号：Traffic + Latency + Errors） ───

/**
 * HTTP 请求耗时直方图
 * 企业理由：延迟分位数（P50/P95/P99）是 SRE 黄金信号的核心指标，
 * 平均值会掩盖长尾延迟问题。
 */
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

/**
 * HTTP 请求总数计数器
 * 企业理由：按 method/route/status_code 分组的请求量（RPS）是流量监控基础。
 */
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ─── Go 引擎指标（业务指标） ───

/**
 * Go 引擎调用总数
 */
export const engineCallsTotal = new client.Counter({
  name: 'go_engine_calls_total',
  help: 'Total number of calls to Go engine',
  labelNames: ['result'], // 'success' | 'fallback'
  registers: [register],
});

/**
 * Go 引擎调用耗时
 */
export const engineCallDuration = new client.Histogram({
  name: 'go_engine_call_duration_seconds',
  help: 'Duration of Go engine calls in seconds',
  labelNames: ['result'], // 'success' | 'fallback'
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * 引擎不可用次数（名称保留向后兼容，实际记录 Go 引擎熔断/不可用事件）
 */
export const fallbackToNodeTotal = new client.Counter({
  name: 'fallback_to_node_total',
  help: 'Total number of engine unavailable events (Go circuit breaker open/fallback)',
  labelNames: ['reason'],
  registers: [register],
});

// ─── 业务指标（T-B3） ───

/**
 * 回测请求总数（按 sync/async 与结果状态分组）
 *
 * 企业理由：系统指标无法反映业务健康（如降级率飙升）。
 * 业务指标是 SRE 与产品对齐 SLO 的基础（如「99% 回测在 2s 内完成且非降级」）。
 */
export const backtestRequestsTotal = new client.Counter({
  name: 'backtest_requests_total',
  help: 'Total backtest-related API requests',
  labelNames: ['endpoint', 'mode', 'status'],
  registers: [register],
});

/**
 * 降级响应计数
 *
 * 企业理由：degraded=true 表示引擎/数据路径异常但仍有兜底响应，
 * 持续升高是容量或依赖故障的早期信号，需在业务层告警而非只看 5xx。
 */
export const degradedResponsesTotal = new client.Counter({
  name: 'degraded_responses_total',
  help: 'Responses served in degraded mode',
  labelNames: ['endpoint', 'reason'],
  registers: [register],
});

/**
 * PostgreSQL 连接池等待队列长度（T-B6 Saturation）
 *
 * 企业理由：100x 流量下 pool.waitingCount 先于 CPU 饱和，是 DB 瓶颈 leading indicator。
 */
export const pgPoolWaitingCount = new client.Gauge({
  name: 'pg_pool_waiting_count',
  help: 'Number of queued requests waiting for a pool connection',
  labelNames: ['pool'],
  registers: [register],
});

export const pgPoolTotalCount = new client.Gauge({
  name: 'pg_pool_total_connections',
  help: 'Total connections in the pool (idle + in use)',
  labelNames: ['pool'],
  registers: [register],
});

/** 记录回测请求（业务指标封装） */
export function recordBacktestRequest(
  endpoint: string,
  mode: 'sync' | 'async',
  status: 'success' | 'error' | 'timeout',
): void {
  backtestRequestsTotal.inc({ endpoint, mode, status });
}

/** 记录降级响应 */
export function recordDegradedResponse(endpoint: string, reason: string): void {
  const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  degradedResponsesTotal.inc({ endpoint, reason: safeReason });
}

/**
 * 注册 PostgreSQL 连接池饱和度采集（T-B6）
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

/**
 * 记录引擎调用结果
 */
export function recordEngineCall(success: boolean, error?: string): void {
  if (success) {
    engineCallsTotal.inc({ result: 'success' });
  } else {
    engineCallsTotal.inc({ result: 'fallback' });
    if (error) {
      fallbackToNodeTotal.inc({ reason: error.replace(/[^a-zA-Z0-9_-]/g, '_') });
    }
  }
}

/**
 * 记录引擎不可用事件（Go 引擎熔断/调用失败）
 * 函数名保留向后兼容，实际不再降级到 Node.js（ADR-031 fail-closed）
 */
export function recordFallbackToNode(reason: string): void {
  fallbackToNodeTotal.inc({ reason: reason.replace(/[^a-zA-Z0-9_-]/g, '_') });
}

/**
 * 重置指标（仅用于测试）
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

/**
 * 返回 Prometheus register 实例，用于 /metrics 端点
 */
export function getPrometheusRegister(): client.Registry {
  return register;
}
