/**
 * 引擎调用与降级工具（ADR-008：Go 单引擎；ADR-031：fail-closed 降级）
 *
 * 提供 callEngineStrict 高阶函数：调用 Go 引擎（唯一主引擎），
 * 不可用时 fail-closed 抛出 EngineUnavailableError —— 不再静默降级到
 * Node 备用实现返回不一致的数字。
 *
 * 迁移策略（ADR-008 + ADR-031，已完成 Rust 退役）：
 * - Go 引擎为唯一回测/分析/优化/蒙特卡洛引擎，GO_ENGINE_URL 默认 127.0.0.1:5004
 * - 优先级：Go 引擎 → fail-closed（503 + Retry-After）
 * - 正确性关键计算（回测/MC/优化/前沿/分析）绝不静默降级到 Node
 * - Rust 引擎与其熔断器/进程已删除（Go↔Rust parity 验证通过后，见 ADR-008）
 *
 * 企业改造：
 * - 引入 opossum 熔断器（三态模型：Closed → Open → Half-Open）
 * - 引入指数退避重试（仅对幂等操作）
 *
 * 企业理由：
 * - 熔断器：无熔断时一次偶发超时触发全量失败，所有用户受影响。
 *   熔断器的三态模型（Closed/Open/HalfOpen）允许在故障时快速失败，
 *   并在半开状态逐步放流探测恢复，避免雪崩效应。
 * - 重试：瞬态故障（网络抖动）直接失败，用户体验断崖。
 *   指数退避重试让瞬态故障自愈，避免不必要的失败。
 * 权衡：opossum 增加约 50KB 依赖，但换来标准熔断语义。
 */

import CircuitBreaker from 'opossum';
import { callService } from './httpClient.js';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import {
  recordEngineCall,
  recordFallbackToNode,
  engineCallDuration,
  registerCircuitBreakerMetrics,
} from './metrics.js';

/**
 * 调用 Go 引擎，返回解析后的 JSON 或 null（失败时）。
 *
 * 企业理由（ADR-008）：Go 引擎是平台唯一的计算引擎，监听 5004。
 * Go 在并发模型和开发效率上优于此前的 Rust 实现。
 *
 * 认证：通过 X-Engine-Auth 头注入服务间认证 token（config.ENGINE_AUTH_TOKEN），
 * 必须与 engine-go 服务的 ENGINE_AUTH_TOKEN 环境变量保持一致。
 */
async function callGoEngine(endpoint: string, body: unknown): Promise<unknown> {
  const result = await callService(
    config.GO_ENGINE_URL,
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Engine-Auth': config.ENGINE_AUTH_TOKEN,
      },
      body: JSON.stringify(body),
    },
    config.ENGINE_TIMEOUT_MS,
  );
  if (result === null) {
    throw new Error(`Go engine call failed: ${endpoint}`);
  }
  return result;
}

/**
 * Go 引擎熔断器
 *
 * 企业理由：Go 引擎作为唯一主引擎，熔断器保护调用方免受级联故障影响。
 * 熔断器是微服务雪崩防御的核心模式（Netflix Hystrix）：
 * - Closed：正常放行请求
 * - Open：快速失败，不发送请求（避免等待超时拖垮调用方）
 * - HalfOpen：放行少量请求探测恢复
 */
const goCircuitBreaker = new CircuitBreaker(callGoEngine, {
  timeout: config.ENGINE_TIMEOUT_MS,
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
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * 重置引擎可用性缓存（供健康检查等场景使用）
 *
 * 企业理由（ADR-008）：重置 Go 引擎熔断器，
 * 确保健康检查通过后引擎能立即恢复服务。
 */
export function resetEngineAvailability(): void {
  goCircuitBreaker.close();
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
 */
export interface DegradedResponse<T> {
  data: T;
  degraded: true;
  degradedCode: string; // 如 'ENGINE_UNAVAILABLE'
  degradedMessage: string; // 如 '引擎不可用，已降级到 Node.js 备用引擎'
}

/**
 * 类型守卫：判断返回值是否为降级响应
 */
export function isDegradedResponse<T>(
  value: T | DegradedResponse<T>,
): value is DegradedResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'degraded' in value &&
    (value as DegradedResponse<T>).degraded === true
  );
}

/**
 * 解包降级响应返回值，提取实际数据和降级信息。
 *
 * 企业理由：降级响应返回 T | DegradedResponse<T> 联合类型，
 * 调用方需统一解包逻辑，避免每个调用点重复类型判断。
 * 权衡：引入辅助函数增加一层间接调用，但消除了调用方的重复代码。
 */
export function unwrapFallbackResult<T>(result: T | DegradedResponse<T>): {
  data: T;
  degraded: boolean;
  degradedCode?: string;
  degradedMessage?: string;
} {
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
export async function callGoEngineDirect<T>(endpoint: string, body: unknown): Promise<T> {
  const result = await retryWithBackoff(() => goCircuitBreaker.fire(endpoint, body));
  return result as T;
}

/**
 * 引擎不可用错误（fail-closed，ADR-031）。
 *
 * 企业理由：对于正确性关键的计算（组合回测、蒙特卡洛、优化、有效前沿、单资产分析），
 * Go 引擎与 Node 备用引擎的数值结果存在细微差异。付费产品中"静默返回不同的数字"
 * 是正确性事故。因此当引擎不可用时，同步请求必须 fail-closed：抛出本错误，
 * 由路由层翻译为 503 + Retry-After，而非静默返回 Node 计算结果。
 *
 * retryAfterSeconds 提示客户端在多少秒后重试（用于 Retry-After 响应头）。
 */
export class EngineUnavailableError extends Error {
  readonly retryAfterSeconds: number;
  readonly code = 'ENGINE_UNAVAILABLE';
  constructor(endpoint: string, retryAfterSeconds = 30) {
    super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 调用计算引擎，不可用时 fail-closed 抛出 EngineUnavailableError（ADR-031）。
 *
 * 流程（ADR-008 单引擎 + ADR-031 fail-closed）：
 * 1. 通过熔断器调用 Go 引擎（含指数退避重试）—— 唯一主引擎
 * 2. 失败时抛出 EngineUnavailableError —— 不再静默降级到 Node/Rust 备用引擎
 *
 * 企业理由（ADR-031）：正确性关键计算的引擎不可用必须显式失败，
 * 让调用方（同步路由返回 503 + Retry-After；异步任务进入重试/排队），
 * 避免向用户返回与主引擎不一致的数字。
 *
 * 适用范围：组合回测、蒙特卡洛、优化、有效前沿、单资产分析等"引擎-canonical"计算。
 * Node-canonical 功能（tactical/tacticalGrid/signal/goalOptimizer/pca/letf）不经过本函数，
 * 由 Node 直接计算（它们没有引擎实现，Node 即权威实现，非降级）。
 *
 * @typeParam T - 返回值类型
 * @param endpoint - 引擎接口路径
 * @param body - 请求体
 * @throws {EngineUnavailableError} 当 Go 引擎不可用时
 */
export async function callEngineStrict<T>(endpoint: string, body: unknown): Promise<T> {
  try {
    const t0 = Date.now();
    const result = await retryWithBackoff(() => goCircuitBreaker.fire(endpoint, body));
    const elapsed = Date.now() - t0;
    recordEngineCall(true);
    engineCallDuration.observe({ result: 'success' }, elapsed / 1000);
    logger.info(`[callEngineStrict] ${endpoint} Go 引擎耗时 ${elapsed}ms`);
    return result as T;
  } catch (goErr) {
    const errMsg = goErr instanceof Error ? goErr.message : String(goErr);
    recordEngineCall(false, errMsg);
    engineCallDuration.observe({ result: 'unavailable' }, 0);
    logger.error(
      { err: goErr },
      `[callEngineStrict] ${endpoint} Go 引擎不可用，fail-closed 返回 503`,
    );
    throw new EngineUnavailableError(endpoint);
  }
}
