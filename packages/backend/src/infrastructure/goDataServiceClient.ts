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
      // 运行期 res.body 为 undici ReadableStream（async-iterable）；DOM lib 下的 ReadableStream 类型缺
      // asyncIterator，故此处需类型断言（测试 mock 亦按 async-iterable 契约提供 body）
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
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
  const raw = await callGoDataService(path, orgId);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Go data service returned non-JSON response: ${raw.slice(0, 200)}`);
  }
  return {
    success: Boolean(parsed.success),
    data: parsed.data,
    degraded: Boolean(parsed.degraded),
  };
}
