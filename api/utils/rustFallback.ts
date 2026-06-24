/**
 * 引擎调用与降级工具（ADR-008：Go 替代 Rust 迁移策略）
 *
 * 提供 callRustWithFallback 高阶函数：优先调用 Go 引擎，
 * Go 引擎不可用时尝试 Rust 引擎，最终降级到 Node.js 备用实现，并记录降级日志。
 *
 * 迁移策略（ADR-008）：
 * - Go 引擎替代 Rust 引擎，复用同一端口（5002），逐步迁移
 * - 优先级：Go 引擎 → Rust 引擎 → Node.js 备用
 * - 保留 Rust 引擎支持作为回退，确保迁移期间零停机
 * - RUST_ENGINE_URL 标记为废弃，GO_ENGINE_URL 为新标准配置
 *
 * 企业改造：
 * - 引入 opossum 熔断器（三态模型：Closed → Open → Half-Open）
 * - 引入指数退避重试（仅对幂等操作）
 * - Go/Rust 双引擎熔断器独立管理，互不影响
 *
 * 企业理由：
 * - 熔断器：无熔断时一次偶发超时触发 30s 全量降级，所有用户受影响。
 *   熔断器的三态模型（Closed/Open/HalfOpen）允许在故障时快速失败，
 *   并在半开状态逐步放流探测恢复，避免雪崩效应。
 * - 重试：瞬态故障（网络抖动）直接降级，用户体验断崖。
 *   指数退避重试让瞬态故障自愈，避免不必要的降级。
 * - 双引擎：Go 引擎替代 Rust 是渐进式迁移，双引擎保证迁移期间
 *   任一引擎故障不影响服务可用性。
 * 权衡：opossum 增加约 50KB 依赖，但换来标准熔断语义。
 */

import CircuitBreaker from 'opossum';
import { callService } from '../routes/dataRoutes.js';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { recordRustCall, recordFallbackToNode, rustEngineCallDuration, registerCircuitBreakerMetrics } from './metrics.js';

/**
 * 调用 Go 引擎，返回解析后的 JSON 或 null（失败时）。
 *
 * 企业理由（ADR-008）：Go 引擎是 Rust 引擎的替代品，复用同一端口 5002。
 * Go 在并发模型和开发效率上优于 Rust，但 Rust 引擎作为回退保留，
 * 确保迁移期间零停机。Go 引擎接口与 Rust 引擎保持一致（API 兼容）。
 *
 * 认证：通过 X-Engine-Auth 头注入服务间认证 token（config.ENGINE_AUTH_TOKEN），
 * 必须与 engine-go 服务的 ENGINE_AUTH_TOKEN 环境变量保持一致。
 */
async function callGoEngine(endpoint: string, body: unknown): Promise<unknown> {
  const result = await callService(config.GO_ENGINE_URL, endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Engine-Auth': config.ENGINE_AUTH_TOKEN,
    },
    body: JSON.stringify(body),
  }, config.RUST_ENGINE_TIMEOUT_MS);
  if (result === null) {
    throw new Error(`Go engine call failed: ${endpoint}`);
  }
  return result;
}

/**
 * 调用 Rust 引擎，返回解析后的 JSON 或 null（失败时）。
 *
 * 企业理由（ADR-008）：Rust 引擎已标记为废弃（deprecated），
 * 但在 Go 引擎迁移完成前保留作为二级回退。
 * 迁移完成后可移除此函数及对应熔断器。
 *
 * 认证：复用 config.ENGINE_AUTH_TOKEN，与 Go 引擎共享同一认证 token，
 * 因为 Rust 引擎复用同一端口（5002）且 API 兼容。
 */
async function callRustEngine(endpoint: string, body: unknown): Promise<unknown> {
  const result = await callService(config.RUST_ENGINE_URL, endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Engine-Auth': config.ENGINE_AUTH_TOKEN,
    },
    body: JSON.stringify(body),
  }, config.RUST_ENGINE_TIMEOUT_MS);
  if (result === null) {
    throw new Error(`Rust engine call failed: ${endpoint}`);
  }
  return result;
}

/**
 * Go 引擎熔断器
 *
 * 企业理由：Go 引擎作为主引擎，熔断器保护调用方免受级联故障影响。
 * 配置与 Rust 引擎熔断器一致，确保迁移期间行为一致。
 * 独立熔断器确保 Go 引擎故障不影响 Rust 引擎的熔断状态判断。
 */
const goCircuitBreaker = new CircuitBreaker(callGoEngine, {
  timeout: config.RUST_ENGINE_TIMEOUT_MS,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
  rollingCountTimeout: 60000,
  rollingCountBuckets: 10,
});

// Go 引擎熔断器事件监听
goCircuitBreaker.on('open', () => {
  logger.warn('[circuit-breaker] Go 引擎熔断器进入 Open 状态');
  recordFallbackToNode('go_circuit_breaker_open');
});

goCircuitBreaker.on('halfOpen', () => {
  logger.info('[circuit-breaker] Go 引擎熔断器进入 Half-Open 状态，开始探测');
});

goCircuitBreaker.on('close', () => {
  logger.info('[circuit-breaker] Go 引擎熔断器恢复 Closed 状态');
});

goCircuitBreaker.on('fallback', () => {
  recordFallbackToNode('go_circuit_breaker_fallback');
});

// 注册 Go 引擎熔断器状态到 Prometheus 指标
registerCircuitBreakerMetrics('go_engine', goCircuitBreaker);

/**
 * Rust 引擎熔断器（废弃中，保留作为二级回退）
 *
 * 企业理由：熔断器是微服务雪崩防御的核心模式（Netflix Hystrix）。
 * - Closed：正常放行请求
 * - Open：快速失败，不发送请求（避免等待超时拖垮调用方）
 * - HalfOpen：放行少量请求探测恢复
 *
 * 配置说明：
 * - timeout: 单次请求超时（5s，与 RUST_ENGINE_TIMEOUT_MS 一致）
 * - errorThresholdPercentage: 错误率超过 50% 时熔断
 * - resetTimeout: 熔断后 30s 进入半开状态探测
 * - volumeThreshold: 至少 5 次请求才开始计算错误率
 */
const rustCircuitBreaker = new CircuitBreaker(callRustEngine, {
  timeout: config.RUST_ENGINE_TIMEOUT_MS,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
  rollingCountTimeout: 60000,
  rollingCountBuckets: 10,
});

// Rust 引擎熔断器事件监听
rustCircuitBreaker.on('open', () => {
  logger.warn('[circuit-breaker] Rust 引擎熔断器进入 Open 状态');
  recordFallbackToNode('circuit_breaker_open');
});

rustCircuitBreaker.on('halfOpen', () => {
  logger.info('[circuit-breaker] Rust 引擎熔断器进入 Half-Open 状态，开始探测');
});

rustCircuitBreaker.on('close', () => {
  logger.info('[circuit-breaker] Rust 引擎熔断器恢复 Closed 状态');
});

rustCircuitBreaker.on('fallback', () => {
  recordFallbackToNode('circuit_breaker_fallback');
});

// 注册熔断器状态到 Prometheus 指标（T-P1-1 Saturation）
registerCircuitBreakerMetrics('rust_engine', rustCircuitBreaker);

/**
 * 指数退避重试
 *
 * 企业理由：瞬态故障（网络抖动、短暂 GC 停顿）不应直接降级，
 * 重试让系统自愈。指数退避避免重试风暴，Jitter 避免惊群效应。
 * 仅对幂等操作重试（回测计算是纯计算，天然幂等）。
 * 权衡：重试增加延迟（最坏 2x），但比降级到 Node.js 引擎好 10-100x。
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 200,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        // 指数退避 + Jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
        logger.info(`[retry] 第 ${attempt + 1} 次重试，等待 ${Math.round(delay)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * 重置引擎可用性缓存（供健康检查等场景使用）
 *
 * 企业理由（ADR-008）：同时重置 Go 和 Rust 引擎熔断器，
 * 确保健康检查通过后两个引擎都能立即恢复服务。
 */
export function resetRustAvailability(): void {
  goCircuitBreaker.close();
  rustCircuitBreaker.close();
}

/**
 * 降级响应统一 schema
 *
 * 企业理由：多服务架构中降级是常态而非异常。无统一降级标记时，
 * 前端无法区分"正常结果"和"降级结果"，导致：
 * 1. 用户不知道数据可能存在精度差异（引擎 vs Node.js 计算结果）
 * 2. 监控系统无法统计降级率，无法触发告警
 * 3. 自动化测试无法验证降级路径是否正确执行
 * 统一 schema 让所有消费方能一致地感知和处理降级场景。
 * 权衡：降级时返回值从 T 变为 DegradedResponse<T>，调用方需适配，
 * 但这是必要的破坏性变更，通过类型系统强制消费方处理降级标记。
 *
 * ADR-008 变更：degradedCode 从 'RUST_ENGINE_UNAVAILABLE' 改为
 * 'ENGINE_UNAVAILABLE'，因为降级可能由 Go 或 Rust 引擎不可用触发，
 * 不再特指 Rust。旧值 'RUST_ENGINE_UNAVAILABLE' 仍作为向后兼容别名保留。
 */
export interface DegradedResponse<T> {
  data: T;
  degraded: true;
  degradedCode: string;     // 如 'ENGINE_UNAVAILABLE'（新）或 'RUST_ENGINE_UNAVAILABLE'（向后兼容）
  degradedMessage: string;  // 如 '引擎不可用，已降级到 Node.js 备用引擎'
}

/**
 * 类型守卫：判断返回值是否为降级响应
 */
export function isDegradedResponse<T>(value: T | DegradedResponse<T>): value is DegradedResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'degraded' in value &&
    (value as DegradedResponse<T>).degraded === true
  );
}

/**
 * 解包 callRustWithFallback 的返回值，提取实际数据和降级信息。
 *
 * 企业理由：callRustWithFallback 返回 T | DegradedResponse<T> 联合类型，
 * 调用方需统一解包逻辑，避免每个调用点重复类型判断。
 * 权衡：引入辅助函数增加一层间接调用，但消除了调用方的重复代码。
 */
export function unwrapFallbackResult<T>(
  result: T | DegradedResponse<T>,
): { data: T; degraded: boolean; degradedCode?: string; degradedMessage?: string } {
  if (isDegradedResponse(result)) {
    return {
      data: result.data,
      degraded: true,
      degradedCode: result.degradedCode,
      degradedMessage: result.degradedMessage,
    };
  }
  return { data: result, degraded: false };
}

/**
 * 调用 Go 引擎（独立函数，供需要直接调用 Go 引擎的场景使用）
 *
 * 企业理由（ADR-008）：Go 引擎是主引擎，部分场景可能需要直接调用
 * （如健康检查、性能测试），不经过降级链路。
 * 通过 Go 引擎熔断器 + 重试保护，失败时抛出异常。
 *
 * @param endpoint - 引擎接口路径
 * @param body - 请求体
 * @returns Go 引擎返回的解析后 JSON
 */
export async function callGoEngineDirect<T>(
  endpoint: string,
  body: unknown,
): Promise<T> {
  const result = await retryWithBackoff(
    () => goCircuitBreaker.fire(endpoint, body),
  );
  return result as T;
}

/**
 * 调用引擎，失败时降级到 fallbackFn 的高阶函数。
 *
 * 流程（ADR-008 优先级）：
 * 1. 通过熔断器调用 Go 引擎（含指数退避重试）—— 主引擎
 * 2. Go 引擎失败时，通过熔断器调用 Rust 引擎（含重试）—— 二级回退
 * 3. Rust 引擎也失败时，降级到 Node.js 备用引擎 —— 最终兜底
 * 4. 任一引擎成功即返回，不继续尝试下一级
 *
 * 企业理由（ADR-008 迁移策略）：
 * - Go 引擎替代 Rust 引擎，但 Rust 保留作为回退，确保迁移零停机
 * - 迁移完成后可移除 Rust 回退逻辑，简化为 Go → Node.js 两级
 * - 保持函数名 callRustWithFallback 不变，确保向后兼容
 * - degradedCode 使用 'ENGINE_UNAVAILABLE' 替代 'RUST_ENGINE_UNAVAILABLE'
 *
 * @typeParam T - 返回值类型
 * @param endpoint - 引擎接口路径
 * @param body - 请求体
 * @param fallbackFn - 降级时执行的 Node.js 备用实现
 */
export async function callRustWithFallback<T>(
  endpoint: string,
  body: unknown,
  fallbackFn: () => T,
): Promise<T | DegradedResponse<T>> {
  // 第一优先级：Go 引擎（主引擎）
  try {
    const t0 = Date.now();
    const result = await retryWithBackoff(
      () => goCircuitBreaker.fire(endpoint, body),
    );
    const elapsed = Date.now() - t0;
    recordRustCall(true);
    rustEngineCallDuration.observe({ result: 'success' }, elapsed / 1000);
    logger.info(`[callRustWithFallback] ${endpoint} Go 引擎耗时 ${elapsed}ms`);
    return result as T;
  } catch (goErr) {
    const goErrMsg = goErr instanceof Error ? goErr.message : String(goErr);
    logger.warn({ err: goErr }, `[callRustWithFallback] ${endpoint} Go 引擎不可用（${goErrMsg}），尝试 Rust 引擎`);
  }

  // 第二优先级：Rust 引擎（废弃中，保留作为二级回退）
  try {
    const t0 = Date.now();
    const result = await retryWithBackoff(
      () => rustCircuitBreaker.fire(endpoint, body),
    );
    const elapsed = Date.now() - t0;
    recordRustCall(true);
    rustEngineCallDuration.observe({ result: 'success' }, elapsed / 1000);
    logger.info(`[callRustWithFallback] ${endpoint} Rust 引擎耗时 ${elapsed}ms`);
    return result as T;
  } catch (rustErr) {
    const elapsed = Date.now();
    const errMsg = rustErr instanceof Error ? rustErr.message : String(rustErr);
    recordRustCall(false, errMsg);
    rustEngineCallDuration.observe({ result: 'fallback' }, 0);
    logger.warn({ err: rustErr }, `[callRustWithFallback] ${endpoint} Rust 引擎也不可用，降级到 Node.js 备用引擎`);
  }

  // 最终降级：Node.js 备用引擎
  const fbT0 = Date.now();
  const fbResult = fallbackFn();
  logger.info(`[callRustWithFallback] ${endpoint} Node.js 备用引擎耗时 ${Date.now() - fbT0}ms`);
  return {
    data: fbResult,
    degraded: true,
    degradedCode: 'ENGINE_UNAVAILABLE',
    degradedMessage: '引擎不可用，已降级到 Node.js 备用引擎',
  };
}
