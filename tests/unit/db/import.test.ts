/**
 * 数据导入工具单元测试（Task 10）
 *
 * 企业理由：import.ts 是 JSON → PostgreSQL 数据迁移的核心工具，
 * 必须保证：
 * 1. 字段映射正确（指数/CPI/汇率的 JSON 字段名 → 数据库列名）
 * 2. ON CONFLICT DO UPDATE 保证幂等（重复执行不产生重复记录）
 * 3. 空文件/空数组正确处理（不报错，计入 errors/skipped）
 * 4. importAllMarketData 按正确顺序编排（指数 → CPI → 汇率）
 * 5. 事务正确执行（BEGIN/COMMIT，失败时 ROLLBACK）
 *
 * 权衡：mock fs 与 pg Pool/Client，不验证真实数据库行为（属于集成测试范畴）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前就绑定 =====
const dbMocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  getClient: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// ===== Mock 模块 =====

// Mock logger
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

// Mock db/index.js 的 getPool / getClient
vi.mock('../../../packages/backend/src/db/index.js', () => ({
  getPool: dbMocks.getPool,
  getClient: dbMocks.getClient,
}));

// Mock fs：控制目录存在性与文件内容
vi.mock('fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    readdirSync: fsMocks.readdirSync,
    readFileSync: fsMocks.readFileSync,
  },
  existsSync: fsMocks.existsSync,
  readdirSync: fsMocks.readdirSync,
  readFileSync: fsMocks.readFileSync,
}));

import {
  importIndices,
  importCpiData,
  importExchangeRates,
  importAllMarketData,
} from '../../../packages/backend/src/db/import.js';

/** 构造一个 mock PoolClient，记录 query 调用 */
function createMockClient(): pg.PoolClient & {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: vi.fn(),
  } as unknown as pg.PoolClient & {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

/** 构造一个 mock Pool */
function createMockPool(): pg.Pool & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as pg.Pool & { query: ReturnType<typeof vi.fn> };
}

describe('importIndices', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockPool = createMockPool();
    dbMocks.getPool.mockReturnValue(mockPool);
    dbMocks.getClient.mockResolvedValue(mockClient);
  });

  it('应正确映射字段：date/open/high/low/close/volume/adj_close → 数据库列', async () => {
    // 指数 JSON 格式: { prices: [{date, open, high, low, close, adj_close, volume}] }
    const indexData = {
      prices: [
        {
          date: '2024-01-02',
          open: 100.5,
          high: 101.0,
          low: 99.8,
          close: 100.8,
          adj_close: 100.8,
          volume: 1000000,
        },
      ],
    };

    fsMocks.existsSync.mockImplementation((p: string) => {
      // INDICES_DIR 存在，meta 文件不存在
      return !String(p).endsWith('.meta.json');
    });
    fsMocks.readdirSync.mockReturnValue(['SPX.json']);
    fsMocks.readFileSync.mockImplementation((p: string) => {
      if (String(p).endsWith('.meta.json')) return '{}';
      return JSON.stringify(indexData);
    });

    await importIndices();

    // 应执行 BEGIN → INSERT tickers → INSERT prices → COMMIT
    const calls = mockClient.query.mock.calls;
    const beginCall = calls.find((c: unknown[]) => c[0] === 'BEGIN');
    const commitCall = calls.find((c: unknown[]) => c[0] === 'COMMIT');
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();

    // 找到 prices INSERT 调用并验证字段映射
    const pricesInsertCall = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO prices'),
    ) as [string, unknown[]];
    expect(pricesInsertCall).toBeDefined();

    // 参数顺序: [ticker, date, open, high, low, close, volume, adjusted_close]
    const params = pricesInsertCall[1];
    expect(params[0]).toBe('SPX'); // ticker（来自文件名）
    expect(params[1]).toBe('2024-01-02'); // date
    expect(params[2]).toBe(100.5); // open
    expect(params[3]).toBe(101.0); // high
    expect(params[4]).toBe(99.8); // low
    expect(params[5]).toBe(100.8); // close
    expect(params[6]).toBe(1000000); // volume
    expect(params[7]).toBe(100.8); // adjusted_close (adj_close)
  });

  it('SQL 应包含 ON CONFLICT DO UPDATE（幂等保证）', async () => {
    const indexData = { prices: [{ date: '2024-01-02', open: 1, high: 1, low: 1, close: 1 }] };
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['SPX.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(indexData));

    await importIndices();

    const pricesInsertCall = mockClient.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO prices'),
    ) as [string, unknown[]];
    const sql = pricesInsertCall[0];
    expect(sql).toContain('ON CONFLICT (ticker, date) DO UPDATE');
    expect(sql).toContain('EXCLUDED.open');
    expect(sql).toContain('EXCLUDED.close');
  });

  it('空数组应计入 errors 且不调用 INSERT prices', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['EMPTY.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({ prices: [] }));

    const result = await importIndices();

    expect(result.imported).toBe(0);
    expect(result.errors).toBe(1);
    // 不应获取 client（空数组在 getClient 之前 continue）
    expect(dbMocks.getClient).not.toHaveBeenCalled();
  });

  it('目录不存在时应返回零结果且不报错', async () => {
    fsMocks.existsSync.mockReturnValue(false);

    const result = await importIndices();

    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('事务失败时应 ROLLBACK 并计入 errors', async () => {
    const indexData = { prices: [{ date: '2024-01-02', open: 1, high: 1, low: 1, close: 1 }] };
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['SPX.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(indexData));
    // 模拟 INSERT 失败
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') return { rows: [] };
      throw new Error('duplicate key');
    });

    const result = await importIndices();

    expect(result.errors).toBe(1);
    // 应调用 ROLLBACK
    const rollbackCall = mockClient.query.mock.calls.find((c: unknown[]) => c[0] === 'ROLLBACK');
    expect(rollbackCall).toBeDefined();
    // 应释放 client
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('应从 .meta.json 读取元数据（ticker/name/market/exchange）', async () => {
    const indexData = { prices: [{ date: '2024-01-02', open: 1, high: 1, low: 1, close: 1 }] };
    const metaData = { ticker: 'SPX', name: 'S&P 500', market: 'US', exchange: 'NYSE' };
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['SPX.json']);
    fsMocks.readFileSync.mockImplementation((p: string) => {
      if (String(p).endsWith('.meta.json')) return JSON.stringify(metaData);
      return JSON.stringify(indexData);
    });

    await importIndices();

    // 验证 INSERT tickers 使用 meta 中的 name 与 exchange
    const tickersInsertCall = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO tickers'),
    ) as [string, unknown[]];
    expect(tickersInsertCall[1][0]).toBe('SPX'); // ticker
    expect(tickersInsertCall[1][1]).toBe('S&P 500'); // category = name
    expect(tickersInsertCall[1][2]).toBe('NYSE'); // market = exchange
  });
});

describe('importCpiData', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockPool = createMockPool();
    dbMocks.getPool.mockReturnValue(mockPool);
    dbMocks.getClient.mockResolvedValue(mockClient);
  });

  it('应正确映射字段：country/date/value，country 来自文件名', async () => {
    const cpiData = [
      { date: '2024-01-01', value: 300.5 },
      { date: '2024-02-01', value: 301.0 },
    ];
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['us_cpi.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(cpiData));

    await importCpiData();

    // 验证 CPI INSERT 调用
    const cpiInsertCalls = mockClient.query.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO cpi_data'),
    ) as Array<[string, unknown[]]>;

    expect(cpiInsertCalls).toHaveLength(2);
    // 第一条：country=US（文件名 us_cpi.json → 大写 US）
    expect(cpiInsertCalls[0][1][0]).toBe('US');
    expect(cpiInsertCalls[0][1][1]).toBe('2024-01-01');
    expect(cpiInsertCalls[0][1][2]).toBe(300.5);
    // 第二条
    expect(cpiInsertCalls[1][1][0]).toBe('US');
    expect(cpiInsertCalls[1][1][2]).toBe(301.0);
  });

  it('SQL 应包含 ON CONFLICT (country, date) DO UPDATE', async () => {
    const cpiData = [{ date: '2024-01-01', value: 300 }];
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['us_cpi.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(cpiData));

    await importCpiData();

    const cpiInsertCall = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO cpi_data'),
    ) as [string, unknown[]];
    expect(cpiInsertCall[0]).toContain('ON CONFLICT (country, date) DO UPDATE');
    expect(cpiInsertCall[0]).toContain('EXCLUDED.value');
  });

  it('空数组应计入 errors', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['us_cpi.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify([]));

    const result = await importCpiData();

    expect(result.imported).toBe(0);
    expect(result.errors).toBe(1);
    expect(dbMocks.getClient).not.toHaveBeenCalled();
  });

  it('目录不存在时应返回零结果', async () => {
    fsMocks.existsSync.mockReturnValue(false);

    const result = await importCpiData();

    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);
  });
});

describe('importExchangeRates', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockPool = createMockPool();
    dbMocks.getPool.mockReturnValue(mockPool);
    dbMocks.getClient.mockResolvedValue(mockClient);
  });

  it('应正确映射字段：base_currency/target_currency/date/rate', async () => {
    // 汇率 JSON 格式: { "YYYY-MM-DD": rate, ... }
    const fxData = {
      '2024-01-01': 7.12,
      '2024-01-02': 7.15,
    };
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['usd_cny.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(fxData));

    await importExchangeRates();

    const fxInsertCalls = mockClient.query.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO exchange_rates'),
    ) as Array<[string, unknown[]]>;

    expect(fxInsertCalls).toHaveLength(1);
    // 批量 INSERT：单行 SQL 含两行 VALUES
    expect(fxInsertCalls[0][1][0]).toBe('USD');
    expect(fxInsertCalls[0][1][1]).toBe('CNY');
    expect(fxInsertCalls[0][1][2]).toBe('2024-01-01');
    expect(fxInsertCalls[0][1][3]).toBe(7.12);
    expect(fxInsertCalls[0][1][4]).toBe('USD');
    expect(fxInsertCalls[0][1][5]).toBe('CNY');
    expect(fxInsertCalls[0][1][6]).toBe('2024-01-02');
    expect(fxInsertCalls[0][1][7]).toBe(7.15);
  });

  it('SQL 应包含 ON CONFLICT (base_currency, target_currency, date) DO UPDATE', async () => {
    const fxData = { '2024-01-01': 7.12 };
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['usd_cny.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(fxData));

    await importExchangeRates();

    const fxInsertCall = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO exchange_rates'),
    ) as [string, unknown[]];
    expect(fxInsertCall[0]).toContain(
      'ON CONFLICT (base_currency, target_currency, date) DO UPDATE',
    );
    expect(fxInsertCall[0]).toContain('EXCLUDED.rate');
  });

  it('文件名格式不正确（非 base_target.json）应计入 errors', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    // invalid.json 分割后只有 1 部分（不含 _），不符合 base_target 格式
    fsMocks.readdirSync.mockReturnValue(['invalid.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({}));

    const result = await importExchangeRates();

    expect(result.errors).toBe(1);
    expect(result.imported).toBe(0);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('空对象应计入 errors', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['usd_cny.json']);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({}));

    const result = await importExchangeRates();

    expect(result.errors).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('目录不存在时应返回零结果', async () => {
    fsMocks.existsSync.mockReturnValue(false);

    const result = await importExchangeRates();

    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);
  });
});

describe('importAllMarketData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 所有目录都不存在，让三个子函数快速返回零结果
    fsMocks.existsSync.mockReturnValue(false);
  });

  it('应按顺序调用 importIndices → importCpiData → importExchangeRates', async () => {
    const callOrder: string[] = [];
    // 让目录存在但为空，使 "导入开始" 日志被触发
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue([]);

    // logger.info 签名: (obj, msg) — msg 是第二个参数
    loggerMocks.info.mockImplementation((...args: unknown[]) => {
      const msg = args[1];
      if (typeof msg === 'string' && msg.includes('指数数据导入开始')) callOrder.push('indices');
      if (typeof msg === 'string' && msg.includes('CPI 数据导入开始')) callOrder.push('cpi');
      if (typeof msg === 'string' && msg.includes('汇率数据导入开始')) callOrder.push('fx');
    });

    await importAllMarketData();

    expect(callOrder).toEqual(['indices', 'cpi', 'fx']);
  });

  it('应在开始时记录日志，在完成时记录汇总', async () => {
    await importAllMarketData();

    // 开始日志
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('开始导入全部市场数据'));
    // 完成日志（包含三个子结果）
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        indices: expect.any(Object),
        cpi: expect.any(Object),
        exchangeRates: expect.any(Object),
      }),
      expect.stringContaining('全部市场数据导入完成'),
    );
  });
});
