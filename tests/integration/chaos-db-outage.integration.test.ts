/**
 * Chaos: DB Outage via testcontainers（RO-049 SubTask 33.2）
 *
 * 迁移自 tests/chaos/experiment-1-db-disconnect.test.ts。
 * 原 chaos 实验依赖 docker-compose 预启动的 backtest-postgres 容器 + 运行中的 API 服务器，
 * 无 docker-compose 环境时 it.skipIf(!dockerAvailable) 跳过。
 *
 * 本集成测试用 testcontainers 起独立 PG 容器（不依赖 docker-compose），
 * 直接调用 fetchHistoryDataWithDegraded 验证 ADR-031 / gotcha #8 降级链路：
 * - 稳态：PG up → 返回数据，degraded=false
 * - PG down → queryPricesFromDb 捕获连接错误，dbDegraded=true → degraded=true
 * - 恢复：PG restart + closeDb() 重建连接池 → 正常返回数据，degraded=false
 *
 * 权衡：仍依赖 Docker daemon（testcontainers 需要），无 Docker 时 skipIf 跳过。
 * 不依赖 docker-compose 预启动容器，任何 Docker 环境均可运行。
 * 不测试 HTTP 层（/metrics 熔断器状态）——那需要完整 API 服务器，
 * 本测试聚焦数据服务层的降级契约。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLoggerMocks } from '../helpers/mockFactories.js';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('@opentelemetry/api', () => {
  const noopSpan = {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return {
    trace: {
      getTracer: () => ({
        startActiveSpan: async <T>(_name: string, fn: (span: typeof noopSpan) => Promise<T>) =>
          fn(noopSpan),
      }),
    },
  };
});

vi.mock('../../packages/backend/src/infrastructure/dataCache.js', () => ({
  readCache: vi.fn(async () => null),
  getCacheKey: vi.fn(() => 'chaos-test-cache-key'),
  writeCache: vi.fn(),
  CACHE_DIR: '/tmp/chaos-test-cache',
  currentCacheVersion: 1,
  incrementCacheVersion: vi.fn(),
  ensureCacheDir: vi.fn(),
  deletePriceCache: vi.fn(),
  clearPriceCache: vi.fn(),
  setPriceCache: vi.fn(),
}));

vi.mock('../../packages/backend/src/utils/tickerValidation.js', () => ({
  validateTickerFormat: vi.fn((tickers: string[]) => ({ valid: tickers, invalid: [] })),
}));

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { config } from '../../packages/backend/src/config/index.js';
import { getPool, closeDb } from '../../packages/backend/src/db/pool.js';
import { initSchema } from '../../packages/backend/src/db/migrations.js';
import { fetchHistoryData } from '../../packages/backend/src/infrastructure/dataFacade.js';
import { pgCircuitBreaker } from '../../packages/backend/src/infrastructure/dataQuery.js';
import { isDockerAvailable } from '../helpers/testcontainersPg.js';

const dockerAvailable = isDockerAvailable();

(config as { GO_DATA_SERVICE_URL: string }).GO_DATA_SERVICE_URL = 'http://127.0.0.1:1';
(config as { GO_DATA_SERVICE_TIMEOUT_MS: number }).GO_DATA_SERVICE_TIMEOUT_MS = 1000;

let container: StartedPostgreSqlContainer;

/**
 * 创建并初始化 PG 容器：启动容器、设置 DATABASE_URL、初始化 schema、插入测试数据。
 *
 * testcontainers 默认 autoRemove=true，stop() 会删除容器而非仅停止，
 * 因此 PG down 测试后无法 restart，需新建容器恢复。
 */
async function createAndSetupContainer(): Promise<StartedPostgreSqlContainer> {
  const c = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('backtest_test')
    .withUsername('backtest')
    .withPassword('backtest')
    .start();

  const connStr = c.getConnectionUri();
  process.env.DATABASE_URL = connStr;
  (config as { DATABASE_URL: string }).DATABASE_URL = connStr;
  await closeDb();
  await initSchema();

  const pool = getPool();
  await pool.query(
    "INSERT INTO tickers (ticker, market) VALUES ('AAPL', 'US') ON CONFLICT (ticker) DO NOTHING",
  );
  await pool.query(
    "INSERT INTO prices (ticker, date, close) VALUES ('AAPL', '2023-01-03', 130.0) ON CONFLICT (ticker, date) DO NOTHING",
  );
  await pool.query(
    "INSERT INTO prices (ticker, date, close) VALUES ('AAPL', '2023-01-04', 132.5) ON CONFLICT (ticker, date) DO NOTHING",
  );

  return c;
}

beforeAll(async () => {
  if (!dockerAvailable) return;
  container = await createAndSetupContainer();
}, 60000);

afterAll(async () => {
  if (!dockerAvailable) return;
  await closeDb();
  if (container) await container.stop();
}, 30000);

describe.skipIf(!dockerAvailable)('Chaos: DB Outage via testcontainers', () => {
  it('稳态：PG up 时返回数据且不降级', async () => {
    pgCircuitBreaker.close();

    const res = await fetchHistoryData(['AAPL'], '2023-01-01', '2023-12-31');
    expect(res.degraded).toBe(false);
    expect(res.data.AAPL).toBeDefined();
    expect(Object.keys(res.data.AAPL).length).toBeGreaterThan(0);
  });

  it('PG down 时降级标记正确传播（degraded=true）', async () => {
    pgCircuitBreaker.close();

    await container.stop();

    try {
      await new Promise((r) => setTimeout(r, 1000));

      const res = await fetchHistoryData(['AAPL'], '2023-01-01', '2023-12-31');
      expect(res.degraded).toBe(true);
    } finally {
      // testcontainers 默认 autoRemove=true，stop() 已删除容器，无法 restart。
      // 新建容器恢复 PG（含 schema + 测试数据），供后续恢复测试使用。
      container = await createAndSetupContainer();
    }
  }, 60000);

  it('恢复：PG restart 后正常返回数据', async () => {
    pgCircuitBreaker.close();

    const res = await fetchHistoryData(['AAPL'], '2023-01-01', '2023-12-31');
    expect(res.degraded).toBe(false);
    expect(res.data.AAPL).toBeDefined();
  });
});
