/**
 * 数据查询基础设施 — 熔断器 / 信号量 / HTTP agent。
 *
 * 从 dataQuery.ts 拆分（P3-2 M-005）：将 PostgreSQL 熔断器、Go 数据服务并发信号量、
 * HTTP keepAlive agent 等基础设施集中到本文件，便于独立维护与测试。
 */
import { Agent } from 'http';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger.js';
import { registerSemaphoreMetrics, registerCircuitBreakerMetrics } from '../utils/metrics.js';

export const goDataServiceAgent = new Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 50 });

export const MAX_RESPONSE_BODY_SIZE = parseInt(
  process.env.MAX_RESPONSE_BODY_SIZE || String(50 * 1024 * 1024),
  10,
);

// PostgreSQL 熔断器

export const pgCircuitBreaker = new CircuitBreaker(
  async (queryText: string, params?: unknown[]) => {
    // 延迟导入避免循环依赖：pool 模块可能间接触发本模块初始化
    const { getReadPool } = await import('../db/pool.js');
    const pool = getReadPool();
    return pool.query(queryText, params);
  },
  {
    name: 'postgres',
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 10000,
    volumeThreshold: 5,
    rollingCountTimeout: 60000,
    rollingCountBuckets: 6,
  },
);

pgCircuitBreaker.on('open', () => {
  logger.warn('[dataService] PostgreSQL 熔断器 OPEN：后续查询将失败直至恢复');
});
pgCircuitBreaker.on('halfOpen', () => {
  logger.info('[dataService] PostgreSQL 熔断器 HALF-OPEN：放行探测查询');
});
pgCircuitBreaker.on('close', () => {
  logger.info('[dataService] PostgreSQL 熔断器 CLOSED：PostgreSQL 恢复正常');
});

registerCircuitBreakerMetrics('postgres', pgCircuitBreaker);

/** 判断 PostgreSQL 熔断器是否处于可用（关闭/半开）状态 */
export function isDbAvailable(): boolean {
  return !pgCircuitBreaker.opened;
}

// Go 数据服务并发信号量（按租户隔离）

export class Semaphore {
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
export const TENANT_SEMAPHORE_LIMIT = 10;

/** Default semaphore for calls without tenant context (backward compat) */
export const defaultGoServiceSemaphore = new Semaphore(TENANT_SEMAPHORE_LIMIT);

registerSemaphoreMetrics('go_data_service', defaultGoServiceSemaphore.total(), () =>
  defaultGoServiceSemaphore.available(),
);

export function getTenantSemaphore(orgId?: string): Semaphore {
  if (!orgId) return defaultGoServiceSemaphore;
  let sem = tenantSemaphores.get(orgId);
  if (!sem) {
    sem = new Semaphore(TENANT_SEMAPHORE_LIMIT);
    tenantSemaphores.set(orgId, sem);
  }
  return sem;
}