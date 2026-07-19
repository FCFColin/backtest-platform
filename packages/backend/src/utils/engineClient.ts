/**
 * Go 引擎调用客户端（ADR-008 单引擎 + ADR-031 fail-closed）。
 *
 * callEngineStrict：经 opossum 熔断器 + 指数退避重试调用 Go 引擎。
 * 不可用时抛出 EngineUnavailableError（同步请求翻译为 503 + Retry-After）。
 * 4xx 透传 UpstreamProblemError（参数错误不代表服务不可用）。
 */

import CircuitBreaker from 'opossum';
import { z } from 'zod';
import { callService } from './httpClient.js';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { errorMessage, UpstreamProblemError } from './errors.js';
import {
  recordEngineCall,
  recordEngineUnavailable,
  engineCallDuration,
  registerCircuitBreakerMetrics,
} from './metrics.js';

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

const goCircuitBreaker = new CircuitBreaker(callGoEngine, {
  timeout: config.ENGINE_TIMEOUT_MS,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
  rollingCountTimeout: 60000,
  rollingCountBuckets: 10,
  errorFilter: (err) => err instanceof UpstreamProblemError,
});

goCircuitBreaker.on('open', () => {
  logger.warn('[circuit-breaker] Go 引擎熔断器进入 Open 状态');
  recordEngineUnavailable('go_circuit_breaker_open');
});
goCircuitBreaker.on('halfOpen', () => {
  logger.info('[circuit-breaker] Go 引擎熔断器进入 Half-Open 状态');
});
goCircuitBreaker.on('close', () => {
  logger.info('[circuit-breaker] Go 引擎熔断器恢复 Closed 状态');
});
goCircuitBreaker.on('fallback', () => {
  recordEngineUnavailable('go_circuit_breaker_fallback');
});

registerCircuitBreakerMetrics('go_engine', goCircuitBreaker);

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
      if (err instanceof UpstreamProblemError) throw err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
        logger.info(`[retry] 第 ${attempt + 1} 次重试，等待 ${Math.round(delay)}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/** @internal 测试专用：生产代码零外部引用，仅单元测试直接调用 */
export function resetEngineAvailability(): void {
  goCircuitBreaker.close();
}

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
 * 调用 Go 引擎并返回严格类型化结果（ADR-031 fail-closed）。
 *
 * @param endpoint - 引擎端点路径（如 '/api/engine/backtest'）
 * @param body - 请求体
 * @param responseSchema - 可选的 Zod schema，提供时对引擎响应做运行时校验。
 *   校验失败时抛出 Error（不降级），避免类型炸弹向后传播。
 *   未提供时回退到 `as T` 断言（向后兼容）。
 * @throws {EngineUnavailableError} Go 引擎不可用时
 * @throws {UpstreamProblemError} Go 引擎返回 4xx
 * @throws {Error} responseSchema 校验失败时
 */
export async function callEngineStrict<T>(
  endpoint: string,
  body: unknown,
  responseSchema?: z.ZodType<T>,
): Promise<T> {
  try {
    const t0 = Date.now();
    const result = await retryWithBackoff(() => goCircuitBreaker.fire(endpoint, body));
    const elapsed = Date.now() - t0;
    recordEngineCall(true);
    engineCallDuration.observe({ result: 'success' }, elapsed / 1000);
    logger.info(`[callEngineStrict] ${endpoint} Go 引擎耗时 ${elapsed}ms`);

    if (responseSchema) {
      const parsed = responseSchema.safeParse(result);
      if (!parsed.success) {
        logger.error(
          { endpoint, issues: parsed.error.issues },
          '[callEngineStrict] 引擎响应类型校验失败',
        );
        throw new Error(
          `Engine response validation failed for ${endpoint}: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    }

    return result as T;
  } catch (err) {
    if (err instanceof UpstreamProblemError) {
      recordEngineCall(false, err.code);
      engineCallDuration.observe({ result: 'client_error' }, 0);
      logger.warn(`[callEngineStrict] ${endpoint} Go 引擎返回 4xx: ${err.status} ${err.code}`);
      throw err;
    }
    const errMsg = errorMessage(err);
    recordEngineCall(false, errMsg);
    engineCallDuration.observe({ result: 'unavailable' }, 0);
    logger.error({ err }, `[callEngineStrict] ${endpoint} Go 引擎不可用，fail-closed 返回 503`);
    throw new EngineUnavailableError(endpoint);
  }
}
