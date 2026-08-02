/**
 * Go 数据服务 HTTP 客户端 — 从 dataQuery.ts 拆分。
 *
 * 封装 Go data service 的 HTTP 调用：keepAlive agent、信号量并发控制、
 * 响应体大小限制。供 dataQuery.ts 的 fetchMissingFromGoService 使用。
 */
import http, { Agent } from 'http';
import { config } from '../config/index.js';
import { registerSemaphoreMetrics } from '../utils/metrics.js';

const goDataServiceAgent = new Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 50 });

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

// eslint-disable-next-line max-lines-per-function
export async function callGoDataService(path: string, orgId?: string): Promise<string> {
  const semaphore = getTenantSemaphore(orgId);
  await semaphore.acquire().catch(() => {
    throw new Error('Go data service semaphore queue full, try again later');
  });
  try {
    const baseUrl = config.GO_DATA_SERVICE_URL || 'http://127.0.0.1:15003';
    const url = `${baseUrl}${path}`;

    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      const safeResolve = (v: string) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      const safeReject = (e: Error) => {
        if (!settled) {
          settled = true;
          reject(e);
        }
      };
      const req = http.request(
        url,
        {
          method: 'GET',
          timeout: config.GO_DATA_SERVICE_TIMEOUT_MS,
          agent: goDataServiceAgent,
          headers: {
            'X-Data-Service-Auth': config.DATA_SERVICE_AUTH_TOKEN,
            Connection: 'keep-alive',
          },
        },
        (res) => {
          // P0-03：Content-Length 预检——如果响应头声明的大小已超限，直接拒绝不等数据到达
          const contentLength = parseInt(res.headers['content-length'] || '', 10);
          if (!Number.isNaN(contentLength) && contentLength > MAX_RESPONSE_BODY_SIZE) {
            res.destroy();
            safeReject(
              new Error(
                `Go data service response too large: Content-Length ${contentLength} exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
              ),
            );
            return;
          }

          let body = '';
          let receivedBytes = 0;
          res.on('data', (chunk: Buffer) => {
            // P0-03：累加已接收字节数，超限则销毁响应流并拒绝
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_RESPONSE_BODY_SIZE) {
              res.destroy();
              safeReject(
                new Error(
                  `Go data service response too large: received ${receivedBytes} bytes exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
                ),
              );
              return;
            }
            body += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              safeResolve(body);
            } else {
              safeReject(
                new Error(`Go data service returned HTTP ${res.statusCode}: ${body.slice(0, 200)}`),
              );
            }
          });
          // D5-005: response stream error handler — without this, res.destroy() or
          res.on('error', (err: Error) => {
            safeReject(new Error(`Go data service response stream error: ${err.message}`));
          });
        },
      );

      req.on('error', (err: Error) => {
        safeReject(new Error(`Go data service request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        safeReject(new Error('Go data service request timed out after 30 seconds'));
      });

      req.end();
    });
  } finally {
    semaphore.release();
  }
}
