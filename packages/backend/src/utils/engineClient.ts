import CircuitBreaker from 'opossum';
import { z } from 'zod';
import { callService } from './httpClient.js';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { UpstreamProblemError } from './errors.js';
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

export class EngineUnavailableError extends Error {
  readonly retryAfterSeconds: number;
  constructor(endpoint: string, retryAfterSeconds = 30) {
    super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function callEngineStrict<T>(
  endpoint: string,
  body: unknown,
  responseSchema: z.ZodType<unknown>,
): Promise<T> {
  const t0 = Date.now();
  // 熔断 open 期间直接快速失败（重试只会加剧雪崩），指标与 catch 路径一致按 unavailable 记录
  if (goCircuitBreaker.opened) {
    recordEngineCall('unavailable');
    throw new EngineUnavailableError(endpoint);
  }
  try {
    const result = await retryWithBackoff(() => goCircuitBreaker.fire(endpoint, body));
    const elapsed = Date.now() - t0;
    logger.info(`[callEngineStrict] ${endpoint} Go 引擎耗时 ${elapsed}ms`);

    // 引擎统一 { success, data } 包络（engine-go handlers.go okJSON），返回 data
    const data = ((result as { data?: T })?.data ?? result) as T;
    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) {
      logger.error(
        { endpoint, issues: parsed.error.issues },
        '[callEngineStrict] 引擎响应类型校验失败',
      );
      throw new Error(`Engine response validation failed for ${endpoint}: ${parsed.error.message}`);
    }
    // success 指标在契约校验通过后才记录（校验失败属内部错误，不计入 success 也不复用 success+unavailable 双计）
    recordEngineCall('success');
    engineCallDuration.observe({ result: 'success' }, elapsed / 1000);
    return data;
  } catch (err) {
    const elapsed = Date.now() - t0;
    if (err instanceof UpstreamProblemError) {
      recordEngineCall('client_error');
      engineCallDuration.observe({ result: 'client_error' }, elapsed / 1000);
      logger.warn(`[callEngineStrict] ${endpoint} Go 引擎返回 4xx: ${err.status} ${err.code}`);
      throw err;
    }
    recordEngineCall('unavailable');
    engineCallDuration.observe({ result: 'unavailable' }, elapsed / 1000);
    logger.error({ err }, `[callEngineStrict] ${endpoint} Go 引擎不可用，fail-closed 返回 503`);
    throw new EngineUnavailableError(endpoint);
  }
}
