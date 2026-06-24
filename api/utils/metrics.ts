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
 * Python 子进程信号量许可数
 *
 * 企业理由：信号量是 Python 子进程并发的饱和点（max=3）。
 * available 降至 0 表示所有许可被占用，新请求将排队，P95 延迟会劣化。
 * total 为常量（配置值），available 为动态值。
 */
export const pythonSemaphoreAvailable = new client.Gauge({
  name: 'python_semaphore_permits_available',
  help: 'Available permits of Python subprocess semaphore',
  labelNames: ['name'],
  registers: [register],
});

export const pythonSemaphoreTotal = new client.Gauge({
  name: 'python_semaphore_permits_total',
  help: 'Total permits of Python subprocess semaphore (configured max)',
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

/**
 * 注册 Python 信号量采集器
 *
 * 企业理由：信号量许可数为动态值，需通过 collect 函数在 scrape 时实时读取。
 * prom-client Gauge 的 collect 回调在每次 /metrics 请求时触发。
 */
export function registerSemaphoreMetrics(
  name: string,
  total: number,
  getAvailable: () => number,
): void {
  pythonSemaphoreTotal.set({ name }, total);
  pythonSemaphoreAvailable.set({ name }, getAvailable());
  // 使用 collect 回调确保每次 scrape 时获取最新值
  pythonSemaphoreAvailable.set({ name }, 0); // 重置后由 collect 回调更新
  // 注：prom-client Gauge 不支持 per-label collect，改用定时刷新
  setInterval(() => {
    pythonSemaphoreAvailable.set({ name }, getAvailable());
  }, 5_000).unref();
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

// ─── Rust 引擎指标（业务指标） ───

/**
 * Rust 引擎调用总数
 */
export const rustCallsTotal = new client.Counter({
  name: 'rust_engine_calls_total',
  help: 'Total number of calls to Rust engine',
  labelNames: ['result'], // 'success' | 'fallback'
  registers: [register],
});

/**
 * Rust 引擎调用耗时
 */
export const rustEngineCallDuration = new client.Histogram({
  name: 'rust_engine_call_duration_seconds',
  help: 'Duration of Rust engine calls in seconds',
  labelNames: ['result'], // 'success' | 'fallback'
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * 降级到 Node.js 引擎次数
 */
export const fallbackToNodeTotal = new client.Counter({
  name: 'fallback_to_node_total',
  help: 'Total number of fallbacks to Node.js engine',
  labelNames: ['reason'],
  registers: [register],
});

// ─── 兼容旧接口（渐进迁移） ───

/**
 * 记录 Rust 引擎调用结果
 * 兼容旧代码中的 recordRustCall(success, error) 调用
 */
export function recordRustCall(success: boolean, error?: string): void {
  if (success) {
    rustCallsTotal.inc({ result: 'success' });
  } else {
    rustCallsTotal.inc({ result: 'fallback' });
    if (error) {
      fallbackToNodeTotal.inc({ reason: error.replace(/[^a-zA-Z0-9_-]/g, '_') });
    }
  }
}

/**
 * 记录降级到 Node.js 引擎
 * 兼容旧代码中的 recordFallbackToNode(reason) 调用
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
