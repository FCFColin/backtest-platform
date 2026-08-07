import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { loggerMocks } from '../helpers/loggerFixture.js';
import { mockOtelApi } from '../helpers/otelMock.js';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
vi.mock('@opentelemetry/api', () => mockOtelApi());

vi.mock('../../packages/backend/src/infrastructure/dataCache.js', () => ({
  readCache: vi.fn(async () => null),
  getCacheKey: vi.fn(() => 'chaos-test-cache-key'),
  writeCache: vi.fn(),
  setPriceCache: vi.fn(),
  deletePriceCache: vi.fn(),
  clearPriceCache: vi.fn(),
  invalidateTickerCache: vi.fn(),
  invalidateAllCache: vi.fn(),
  HISTORY_CACHE_TTL_SEC: 86400,
  SEARCH_CACHE_TTL_SEC: 3600,
  PRICE_CACHE_TTL_SEC: 86400,
  REALTIME_CACHE_TTL_SEC: 300,
  DEFAULT_ORG_ID: 'shared',
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
