import { config } from '../config/index.js';
import { registerSemaphoreMetrics } from '../utils/metrics.js';

const MAX_RESPONSE_BODY_SIZE = config.MAX_RESPONSE_BODY_SIZE;

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

const defaultGoServiceSemaphore = new Semaphore(TENANT_SEMAPHORE_LIMIT);

registerSemaphoreMetrics('go_data_service', defaultGoServiceSemaphore.total(), () =>
  defaultGoServiceSemaphore.available(),
);

const MAX_TENANT_SEMAPHORES = 1000;
function getTenantSemaphore(orgId?: string): Semaphore {
  if (!orgId) return defaultGoServiceSemaphore;
  let sem = tenantSemaphores.get(orgId);
  if (!sem) {
    if (tenantSemaphores.size >= MAX_TENANT_SEMAPHORES) return defaultGoServiceSemaphore;
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
