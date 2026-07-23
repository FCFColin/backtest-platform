import { describe, it, expect, vi, beforeEach } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

const integrityMocks = vi.hoisted(() => ({
  signFile: vi.fn(),
  verifyFile: vi.fn(),
}));

const redisMocks = vi.hoisted(() => ({
  ping: vi.fn(),
  on: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('fs', () => ({
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  readFileSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: fsMocks.readFile,
  writeFile: fsMocks.writeFile,
  access: fsMocks.access,
}));

vi.mock('../../../packages/backend/src/utils/integrity.js', () => integrityMocks);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
  getRedisHealth: vi.fn().mockResolvedValue(true),
  markRedisUnhealthy: vi.fn(),
}));

import {
  ensureCacheDir,
  getCacheKey,
  readCache,
  writeCache,
  readCacheVersion,
  incrementCacheVersion,
  deletePriceCache,
  clearPriceCache,
} from '../../../packages/backend/src/infrastructure/dataCache.js';

beforeEach(() => {
  vi.clearAllMocks();
  fsMocks.existsSync.mockReturnValue(true);
  fsMocks.readFile.mockResolvedValue('42');
  fsMocks.writeFile.mockResolvedValue(undefined);
  fsMocks.access.mockResolvedValue(undefined);
  integrityMocks.verifyFile.mockResolvedValue(true);
  integrityMocks.signFile.mockResolvedValue(undefined);
  redisMocks.ping.mockResolvedValue('PONG');
});

describe('ensureCacheDir', () => {
  it('目录不存在时应创建', () => {
    fsMocks.existsSync.mockReturnValueOnce(false);
    ensureCacheDir();
    expect(fsMocks.mkdirSync).toHaveBeenCalled();
  });

  it('目录已存在时应跳过创建', () => {
    ensureCacheDir();
    expect(fsMocks.mkdirSync).not.toHaveBeenCalled();
  });
});

describe('getCacheKey', () => {
  it('应生成一致的缓存键', () => {
    const key = getCacheKey('prices', { tickers: 'SPY,VTI', startDate: '2024-01-01' });
    expect(key).toMatch(/^prices_.+\.json$/);
  });

  it('应按参数名排序', () => {
    const key1 = getCacheKey('test', { b: '2', a: '1' });
    const key2 = getCacheKey('test', { a: '1', b: '2' });
    expect(key1).toBe(key2);
  });

  it('应清理非法字符', () => {
    const key = getCacheKey('test', { bad: '<script>alert(1)</script>' });
    expect(key).not.toContain('<');
    expect(key).not.toContain('>');
  });
});

describe('readCacheVersion', () => {
  it('应读取缓存版本号', async () => {
    fsMocks.readFile.mockResolvedValueOnce('5');
    const v = await readCacheVersion();
    expect(v).toBe(5);
  });

  it('文件不存在应返回 0', async () => {
    fsMocks.readFile.mockRejectedValueOnce(new Error('ENOENT'));
    const v = await readCacheVersion();
    expect(v).toBe(0);
  });

  it('内容非数字应返回 0', async () => {
    fsMocks.readFile.mockResolvedValueOnce('not-a-number');
    const v = await readCacheVersion();
    expect(v).toBe(0);
  });
});

describe('incrementCacheVersion', () => {
  it('应递增缓存版本', async () => {
    fsMocks.readFile.mockResolvedValueOnce('3');
    await incrementCacheVersion();
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.cache_version'),
      '4',
      'utf-8',
    );
  });
});

describe('readCache', () => {
  it('文件不存在应返回 null', async () => {
    fsMocks.access.mockRejectedValueOnce(new Error('ENOENT'));
    const r = await readCache('test.json');
    expect(r).toBeNull();
  });

  it('完整性校验失败应返回 null', async () => {
    integrityMocks.verifyFile.mockResolvedValueOnce(false);
    const r = await readCache('test.json');
    expect(r).toBeNull();
  });

  it('缓存版本不匹配应返回 null', async () => {
    fsMocks.readFile.mockResolvedValueOnce(
      JSON.stringify({ __cacheVersion: 1, __data: { price: 100 } }),
    );
    const r = await readCache('test.json');
    expect(r).toBeNull();
  });

  it('缓存版本匹配应返回数据', async () => {
    fsMocks.readFile.mockResolvedValueOnce(
      JSON.stringify({ __cacheVersion: 42, __data: { price: 100 } }),
    );
    const r = await readCache('test.json');
    expect(r).toEqual({ price: 100 });
  });

  it('JSON 解析失败应返回 null', async () => {
    fsMocks.readFile.mockResolvedValueOnce('invalid json');
    const r = await readCache('test.json');
    expect(r).toBeNull();
  });
});

describe('writeCache', () => {
  it('应写入带版本号的包装数据并签名', async () => {
    await writeCache('test.json', { price: 100 });
    expect(fsMocks.writeFile).toHaveBeenCalled();
    const writeCall = fsMocks.writeFile.mock.calls[0];
    const written = JSON.parse(writeCall[1]);
    expect(written.__cacheVersion).toBeDefined();
    expect(written.__data).toEqual({ price: 100 });
    expect(integrityMocks.signFile).toHaveBeenCalled();
  });
});

describe('deletePriceCache', () => {
  it('Redis 可用时应删除 Redis 缓存', async () => {
    await deletePriceCache('SPY');
    expect(redisMocks.del).toHaveBeenCalledWith('price_cache:SPY');
  });

  it('clearPriceCache 应清空 Redis + 内存缓存', async () => {
    redisMocks.scan.mockResolvedValueOnce(['0', ['price_cache:SPY', 'price_cache:VTI']]);
    await clearPriceCache();
    expect(redisMocks.del).toHaveBeenCalledWith('price_cache:SPY', 'price_cache:VTI');
  });
});
