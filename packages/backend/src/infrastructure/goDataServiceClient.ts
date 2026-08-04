/**
 * Go 数据服务 HTTP 客户端 — 从 dataQuery.ts 拆分。
 *
 * 封装 Go data service 的 HTTP 调用：信号量并发控制、响应体大小限制（P0-03）。
 * 供 dataQuery.ts 的 fetchMissingFromGoService 使用。
 */
import { config } from '../config/index.js';
import { registerSemaphoreMetrics } from '../utils/metrics.js';

const MAX_RESPONSE_BODY_SIZE = parseInt(
  process.env.MAX_RESPONSE_BODY_SIZE || String(50 * 1024 * 1024),
  10,
);

class Semaphore {
  private permits: number;
  private readonly maxPermits: number;
  private waitQueue: Array<() => void> = [];
  private readonly maxQueueSize: number;

  constructor(maxConcurrency: number, maxQueueSize = 100) {
    this.permits = maxConcurrency;
    this.maxPermits = maxConcurrency;
    this.maxQueueSize = maxQueueSize;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    if (this.waitQueue.length >= this.maxQueueSize) {
      throw new Error('Semaphore queue full');
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  available(): number {
    return this.permits;
  }

  total(): number {
    return this.maxPermits;
  }
}

const tenantSemaphores = new Map<string, Semaphore>();
const TENANT_SEMAPHORE_LIMIT = 10;

/** Default semaphore for calls without tenant context (backward compat) */
const defaultGoServiceSemaphore = new Semaphore(TENANT_SEMAPHORE_LIMIT);

registerSemaphoreMetrics('go_data_service', defaultGoServiceSemaphore.total(), () =>
  defaultGoServiceSemaphore.available(),
);

function getTenantSemaphore(orgId?: string): Semaphore {
  if (!orgId) return defaultGoServiceSemaphore;
  let sem = tenantSemaphores.get(orgId);
  if (!sem) {
    sem = new Semaphore(TENANT_SEMAPHORE_LIMIT);
    tenantSemaphores.set(orgId, sem);
  }
  return sem;
}

export async function callGoDataService(path: string, orgId?: string): Promise<string> {
  const semaphore = getTenantSemaphore(orgId);
  await semaphore.acquire().catch(() => {
    throw new Error('Go data service semaphore queue full, try again later');
  });
  try {
    const baseUrl = config.GO_DATA_SERVICE_URL || 'http://127.0.0.1:15003';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.GO_DATA_SERVICE_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: { 'X-Data-Service-Auth': config.DATA_SERVICE_AUTH_TOKEN },
      });
      // P0-03：Content-Length 预检——声明大小超限直接拒绝
      const contentLength = parseInt(res.headers.get('content-length') ?? '', 10);
      if (!Number.isNaN(contentLength) && contentLength > MAX_RESPONSE_BODY_SIZE) {
        throw new Error(
          `Go data service response too large: Content-Length ${contentLength} exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
        );
      }
      let body = '';
      for await (const chunk of res.body!) {
        body += Buffer.from(chunk).toString();
        // P0-03：流式累计字节数超限则中断读取并拒绝（for-await 退出时自动取消流）
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
    } finally {
      clearTimeout(timer);
    }
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
    semaphore.release();
  }
}
