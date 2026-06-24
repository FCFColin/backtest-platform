/**
 * EngineService 单元测试（Task 11）
 *
 * 企业理由：EngineService 管理数据引擎（Python 子进程）的调用与缓存数据扫描，
 * 必须保证：
 * 1. triggerUniverseRefresh 正确调用 Python 引擎并处理成功/失败
 * 2. triggerFullUpdate 等异步触发函数正确 spawn 子进程并立即返回
 * 3. getEngineStatus 正确读取文件系统状态
 * 4. loadTickerData 拒绝非法 ticker（路径遍历防护）
 * 5. getTickerList 从 universe.json 读取，缺失时回退到 tickers 目录
 * 6. searchTickers 正确过滤
 * 7. 错误传播：Python 引擎非零退出时返回错误
 *
 * 权衡：mock child_process.spawn 与 fs，不验证真实 Python 进程行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ===== vi.hoisted =====
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const tickerValidationMocks = vi.hoisted(() => ({
  isValidTicker: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  writeFile: vi.fn(),
  mkdirSync: vi.fn(),
}));

const spawnMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
    debug: loggerMocks.debug,
  },
}));

vi.mock('../../../api/utils/tickerValidation.js', () => ({
  isValidTicker: tickerValidationMocks.isValidTicker,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    readFileSync: fsMocks.readFileSync,
    statSync: fsMocks.statSync,
    readdirSync: fsMocks.readdirSync,
    mkdirSync: fsMocks.mkdirSync,
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn(),
    },
  },
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
  statSync: fsMocks.statSync,
  readdirSync: fsMocks.readdirSync,
  mkdirSync: fsMocks.mkdirSync,
}));

vi.mock('child_process', () => ({
  spawn: spawnMocks.spawn,
}));

import {
  getEngineStatus,
  triggerFullUpdate,
  triggerIncrementalUpdate,
  triggerRefetch,
  triggerResume,
  triggerUniverseRefresh,
  getTickerList,
  searchTickers,
  loadTickerData,
  getUniverseStats,
} from '../../../api/services/engineService.js';

/** 创建一个 mock 子进程（EventEmitter 模拟 stdout/stderr/close） */
function createMockChildProcess(opts: { stdout?: string; stderr?: string; exitCode?: number; error?: Error } = {}) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.unref = vi.fn();
  proc.stdin = { end: vi.fn() };

  // 异步触发事件（模拟真实进程行为）
  queueMicrotask(() => {
    if (opts.error) {
      proc.emit('error', opts.error);
      return;
    }
    if (opts.stdout) proc.stdout.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) proc.stderr.emit('data', Buffer.from(opts.stderr));
    proc.emit('close', opts.exitCode ?? 0);
  });

  return proc;
}

describe('triggerUniverseRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Python 引擎正常退出时应返回 completed', async () => {
    spawnMocks.spawn.mockReturnValue(createMockChildProcess({
      stdout: '{"success": true}',
      exitCode: 0,
    }));

    const result = await triggerUniverseRefresh();

    expect(result.status).toBe('completed');
    expect(result.message).toContain('已刷新');
    // 验证 spawn 调用参数：python -m engine.main universe
    expect(spawnMocks.spawn).toHaveBeenCalledWith(
      expect.any(String), // python 或 python3
      expect.arrayContaining(['-m', 'engine.main', 'universe']),
      expect.objectContaining({ cwd: expect.any(String) }),
    );
  });

  it('Python 引擎非零退出时应返回 error（错误传播）', async () => {
    spawnMocks.spawn.mockReturnValue(createMockChildProcess({
      stderr: 'ModuleNotFoundError: No module named engine',
      exitCode: 1,
    }));

    const result = await triggerUniverseRefresh();

    expect(result.status).toBe('error');
    expect(result.message).toContain('刷新失败');
    expect(result.message).toContain('Engine exited 1');
  });

  it('spawn error 事件应返回 error', async () => {
    spawnMocks.spawn.mockReturnValue(createMockChildProcess({
      error: new Error('spawn python ENOENT'),
    }));

    const result = await triggerUniverseRefresh();

    expect(result.status).toBe('error');
    expect(result.message).toContain('spawn python ENOENT');
  });
});

describe('triggerFullUpdate / triggerIncrementalUpdate / triggerRefetch / triggerResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggerFullUpdate 应异步启动并立即返回 started', () => {
    const mockProc = createMockChildProcess();
    spawnMocks.spawn.mockReturnValue(mockProc);

    const result = triggerFullUpdate();

    expect(result.status).toBe('started');
    expect(result.message).toContain('全量更新');
    // 应调用 unref（异步启动，不等待）
    expect(mockProc.unref).toHaveBeenCalled();
    // 验证 spawn 参数包含 'full'
    expect(spawnMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['full']),
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  it('triggerIncrementalUpdate 应传入 incremental 参数', () => {
    spawnMocks.spawn.mockReturnValue(createMockChildProcess());

    const result = triggerIncrementalUpdate();

    expect(result.status).toBe('started');
    expect(spawnMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['incremental']),
      expect.any(Object),
    );
  });

  it('triggerRefetch 应传入 refetch 参数', () => {
    spawnMocks.spawn.mockReturnValue(createMockChildProcess());

    const result = triggerRefetch();

    expect(result.status).toBe('started');
    expect(spawnMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['refetch']),
      expect.any(Object),
    );
  });

  it('triggerResume 应传入 resume 参数', () => {
    spawnMocks.spawn.mockReturnValue(createMockChildProcess());

    const result = triggerResume();

    expect(result.status).toBe('started');
    expect(spawnMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['resume']),
      expect.any(Object),
    );
  });
});

describe('getEngineStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('目录不存在时应返回零值状态', () => {
    fsMocks.existsSync.mockReturnValue(false);

    const status = getEngineStatus();

    expect(status.totalTickers).toBe(0);
    expect(status.cachedTickers).toBe(0);
    expect(status.lastUpdate).toBeNull();
    expect(status.progress).toBeNull();
    expect(status.universeAge).toBeNull();
  });

  it('应统计已缓存标的数量并读取进度文件', () => {
    // tickers 目录存在，有 2 个 JSON 文件
    fsMocks.existsSync.mockImplementation((p: string) => {
      const s = String(p);
      return s.includes('tickers') || s.includes('progress.json') || s.includes('universe.json');
    });
    fsMocks.readdirSync.mockReturnValue(['AAPL.json', 'BND.json']);
    fsMocks.statSync.mockReturnValue({ mtime: new Date('2024-01-01T00:00:00Z') });
    fsMocks.readFileSync.mockImplementation((p: string) => {
      const s = String(p);
      if (s.includes('progress.json')) return JSON.stringify({ current: 5, total: 10 });
      if (s.includes('universe.json')) return JSON.stringify({ tickers: [{ ticker: 'AAPL' }] });
      return '{}';
    });

    const status = getEngineStatus();

    expect(status.cachedTickers).toBe(2);
    expect(status.totalTickers).toBe(1);
    expect(status.lastUpdate).toBeDefined();
    expect(status.progress).toEqual({ current: 5, total: 10 });
  });

  it('进度文件 JSON 损坏时应记录 warn 且 progress 为 null', () => {
    fsMocks.existsSync.mockImplementation((p: string) => String(p).includes('progress.json'));
    fsMocks.readFileSync.mockReturnValue('not valid json{{{');

    const status = getEngineStatus();

    expect(status.progress).toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});

describe('loadTickerData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('合法 ticker 应读取对应 JSON 文件', () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    fsMocks.existsSync.mockReturnValue(true);
    const mockData = { meta: { ticker: 'AAPL' }, prices: [{ date: '2024-01-02', close: 185.5 }] };
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(mockData));

    const result = loadTickerData('AAPL');

    expect(result).toEqual(mockData);
  });

  it('非法 ticker 应返回 null（路径遍历防护）', () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(false);

    const result = loadTickerData('../../../etc/passwd');

    expect(result).toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('拒绝非法 ticker'),
    );
  });

  it('文件不存在时应返回 null', () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    fsMocks.existsSync.mockReturnValue(false);

    const result = loadTickerData('UNKNOWN');

    expect(result).toBeNull();
  });

  it('JSON 解析失败时应返回 null', () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue('invalid json{{{');

    const result = loadTickerData('AAPL');

    expect(result).toBeNull();
  });

  it('ticker 中的点号应替换为下划线作为文件名', () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue('{}');

    loadTickerData('BRK.B');

    // 验证文件路径使用 BRK_B.json（点号替换为下划线）
    const readCall = fsMocks.readFileSync.mock.calls[0];
    expect(String(readCall[0])).toContain('BRK_B.json');
  });
});

describe('getTickerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应从 universe.json 读取标的列表', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      tickers: [
        { ticker: 'AAPL', name: 'Apple', category: 'STOCK', market: 'US' },
        { ticker: 'BND', name: 'Vanguard Bond', category: 'ETF', market: 'US' },
      ],
    }));

    const result = await getTickerList();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ticker: 'AAPL',
      name: 'Apple',
      category: 'STOCK',
      market: 'US',
    });
  });

  it('universe.json 不存在时应从 tickers 目录回退', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => {
      return String(p).includes('tickers') && !String(p).includes('universe');
    });
    fsMocks.readdirSync.mockReturnValue(['AAPL.json', 'BND.json', 'BRK_B.json']);

    const result = await getTickerList();

    expect(result).toHaveLength(3);
    // 文件名中下划线应还原为点号
    expect(result.find(t => t.ticker === 'BRK.B')).toBeDefined();
  });

  it('universe.json 与 tickers 目录都不存在时应返回空数组', async () => {
    fsMocks.existsSync.mockReturnValue(false);

    const result = await getTickerList();

    expect(result).toEqual([]);
  });

  it('universe.json JSON 损坏时应回退到 tickers 目录', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue('invalid json{{{');
    fsMocks.readdirSync.mockReturnValue(['AAPL.json']);

    const result = await getTickerList();

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('AAPL');
  });
});

describe('searchTickers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应根据 query 过滤标的（不区分大小写）', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      tickers: [
        { ticker: 'AAPL', name: 'Apple', category: 'STOCK', market: 'US' },
        { ticker: 'BND', name: 'Vanguard Bond', category: 'ETF', market: 'US' },
        { ticker: 'SPY', name: 'S&P 500', category: 'ETF', market: 'US' },
      ],
    }));

    const result = await searchTickers('bond');

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('BND');
  });

  it('应匹配 ticker/name/category/market 任一字段', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      tickers: [
        { ticker: 'AAPL', name: 'Apple', category: 'STOCK', market: 'US' },
        { ticker: '600519.SH', name: '贵州茅台', category: 'STOCK', market: 'CN' },
      ],
    }));

    const result = await searchTickers('cn');

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('600519.SH');
  });

  it('结果应限制在 30 条以内', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    const tickers = Array.from({ length: 50 }, (_, i) => ({
      ticker: `STOCK${i}`,
      name: `Stock ${i}`,
      category: 'STOCK',
      market: 'US',
    }));
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({ tickers }));

    const result = await searchTickers('stock');

    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe('getUniverseStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应从 universe.json 读取统计', () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      total_count: 100,
      updated_at: '2024-01-01T00:00:00Z',
      stats: { US: 60, CN: 40 },
    }));

    const result = getUniverseStats();

    expect(result.total).toBe(100);
    expect(result.updated_at).toBe('2024-01-01T00:00:00Z');
    expect(result.stats).toEqual({ US: 60, CN: 40 });
  });

  it('universe.json 不存在时应返回零值', () => {
    fsMocks.existsSync.mockReturnValue(false);

    const result = getUniverseStats();

    expect(result.total).toBe(0);
    expect(result.updated_at).toBe('');
    expect(result.stats).toEqual({});
  });

  it('JSON 损坏时应返回零值并记录 warn', () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue('invalid json{{{');

    const result = getUniverseStats();

    expect(result.total).toBe(0);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});
