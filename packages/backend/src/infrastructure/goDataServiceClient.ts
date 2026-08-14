import pLimit from 'p-limit';
import { config } from '../config/index.js';
import { registerSemaphoreMetrics } from '../utils/metrics.js';

const MAX_RESPONSE_BODY_SIZE = config.MAX_RESPONSE_BODY_SIZE;

// 并发限制：每组织独立限流器，避免单组织洪泛拖垮 Go 数据服务；未绑定组织的请求共享默认限流器
const TENANT_CONCURRENCY_LIMIT = 10;
const MAX_TENANT_LIMITERS = 1000;
const MAX_PENDING = 100;

const defaultGoServiceLimiter = pLimit(TENANT_CONCURRENCY_LIMIT);
registerSemaphoreMetrics('go_data_service', TENANT_CONCURRENCY_LIMIT, () =>
  Math.max(TENANT_CONCURRENCY_LIMIT - defaultGoServiceLimiter.activeCount, 0),
);

const tenantLimiters = new Map<string, ReturnType<typeof pLimit>>();
function getTenantLimiter(orgId?: string): ReturnType<typeof pLimit> {
  if (!orgId) return defaultGoServiceLimiter;
  let limiter = tenantLimiters.get(orgId);
  if (!limiter) {
    if (tenantLimiters.size >= MAX_TENANT_LIMITERS) return defaultGoServiceLimiter;
    limiter = pLimit(TENANT_CONCURRENCY_LIMIT);
    tenantLimiters.set(orgId, limiter);
  }
  return limiter;
}

export async function callGoDataService(path: string, orgId?: string): Promise<string> {
  const limiter = getTenantLimiter(orgId);
  if (limiter.pendingCount >= MAX_PENDING) {
    throw new Error('Go data service queue full, try again later');
  }
  return limiter(async () => {
    const baseUrl = config.GO_DATA_SERVICE_URL || 'http://127.0.0.1:15003';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.GO_DATA_SERVICE_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: { 'X-Data-Service-Auth': config.DATA_SERVICE_AUTH_TOKEN },
      });
      const contentLength = parseInt(res.headers.get('content-length') ?? '', 10);
      if (!Number.isNaN(contentLength) && contentLength > MAX_RESPONSE_BODY_SIZE) {
        throw new Error(
          `Go data service response too large: Content-Length ${contentLength} exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
        );
      }
      let body = '';
      for await (const chunk of res.body!) {
        body += Buffer.from(chunk).toString();
        if (body.length > MAX_RESPONSE_BODY_SIZE) {
          throw new Error(
            `Go data service response too large: received ${body.length} bytes exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
          );
        }
      }
      if (!res.ok) {
        throw new Error(`Go data service returned HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return body;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Go data service')) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          `Go data service request timed out after ${config.GO_DATA_SERVICE_TIMEOUT_MS}ms`,
        );
      }
      throw new Error(
        `Go data service request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  });
}

export async function fetchGoJson(
  path: string,
  orgId?: string,
): Promise<{ success: boolean; data?: unknown; degraded?: boolean }> {
  const parsed = JSON.parse(await callGoDataService(path, orgId));
  return {
    success: Boolean(parsed.success),
    data: parsed.data,
    degraded: Boolean(parsed.degraded),
  };
}
