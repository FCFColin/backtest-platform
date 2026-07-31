import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../../helpers/expressMocks.js';
import { mockLogger, createMockClient } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => {
  const childInfo = vi.fn();
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: childInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
    childInfo,
  };
});

const poolMocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

// Mock db/pool.js：getPool 返回带 mock query 的对象
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: poolMocks.query }),
}));

import {
  auditLog,
  verifyPayload,
  writeOutboxEvent,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import { config } from '../../../packages/backend/src/config/index.js';

function createMockReqRes(opts: {
  method?: string;
  headers?: Record<string, string>;
  path?: string;
}) {
  const req = createMockRequest({
    method: opts.method || 'POST',
    headers: opts.headers || {},
    path: opts.path || '/api/admin/test',
    url: opts.path || '/api/admin/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });

  const res = {
    ...createMockResponse(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'finish') res._finishCallback = cb;
    }),
  } as unknown as Response;

  const next = vi.fn();

  return { req, res, next };
}

describe('auditLog 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('$method 请求应跳过审计日志', (method) => {
    const { req, res, next } = createMockReqRes({ method });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'POST', checkNext: true },
    { method: 'PUT', checkNext: false },
    { method: 'DELETE', checkNext: false },
  ])('$method 请求应注册 finish 事件回调', ({ method, checkNext }) => {
    const { req, res, next } = createMockReqRes({ method });
    auditLog(req, res, next);
    if (checkNext) expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('finish 回调应记录审计日志', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    });
    auditLog(req, res, next);

    const finishCb = res._finishCallback;
    expect(finishCb).toBeDefined();
    finishCb();

    expect(loggerMocks.info).toHaveBeenCalled();
    expect(loggerMocks.childInfo).toHaveBeenCalled();
  });

  it.each([
    { name: '无 x-api-key 时 userId 应为 anonymous', headers: {}, expectUserId: 'anonymous' },
    {
      name: '有 x-api-key 时 userId 应为 SHA-256 哈希前 16 位（非明文）',
      headers: { 'x-api-key': 'my-secret-key' },
      notContaining: 'my-secret-key',
    },
  ])('$name', ({ headers, expectUserId, notContaining }) => {
    const { req, res, next } = createMockReqRes({ method: 'POST', headers });
    auditLog(req, res, next);

    const finishCb = res._finishCallback;
    finishCb();

    expect(loggerMocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining(
        notContaining
          ? { userId: expect.not.stringContaining(notContaining) }
          : { userId: expectUserId },
      ),
      expect.any(String),
    );
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: 'SQL 注入作为 path 应被安全存储（参数化查询）',
      path: "/api/users' OR '1'='1",
      expectVerbatim: true,
    },
    {
      name: '超大 path（10KB）应被安全处理（不崩溃）',
      path: '/api/' + 'a'.repeat(10 * 1024),
      expectVerbatim: false,
    },
  ])('$name', ({ path, expectVerbatim }) => {
    const { req, res, next } = createMockReqRes({ method: 'POST', path });
    auditLog(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

    // 触发 finish 回调
    const finishCb = res._finishCallback;
    expect(finishCb).toBeDefined();
    // 应不抛出异常地记录审计日志
    expect(() => finishCb()).not.toThrow();

    // 验证审计日志被记录（path 通过参数化查询安全存储）
    expect(loggerMocks.childInfo).toHaveBeenCalled();
    const loggedEntry = loggerMocks.childInfo.mock.calls[0]?.[0];
    if (expectVerbatim) {
      // path 应被原样记录（参数化查询防止注入执行）
      expect(loggedEntry.path).toBe(path);
    } else {
      // path 应被记录（可能被截断或完整存储，关键是进程不崩溃）
      expect(loggedEntry.path).toBeDefined();
      expect(typeof loggedEntry.path).toBe('string');
    }
  });

  it('原型污染：headers 含 __proto__ 不应修改 Object.prototype', () => {
    // 确保测试前 Object.prototype 未被污染
    expect({}.admin).toBeUndefined();

    // 使用 JSON.parse 模拟来自 HTTP 请求的 headers（__proto__ 作为自有属性）
    const maliciousHeaders = JSON.parse('{"__proto__": {"admin": true}, "x-api-key": "test-key"}');

    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: maliciousHeaders,
    });
    auditLog(req, res, next);

    const finishCb = res._finishCallback;
    expect(() => finishCb()).not.toThrow();

    // 关键安全断言：Object.prototype 未被污染
    expect({}.admin).toBeUndefined();
    // 审计日志应正常记录
    expect(loggerMocks.childInfo).toHaveBeenCalled();
  });
});

describe('verifyPayload HMAC 签名', () => {
  const originalKey = config.AUDIT_HMAC_KEY;

  afterEach(() => {
    config.AUDIT_HMAC_KEY = originalKey;
  });

  it.each([
    {
      name: '未配置 AUDIT_HMAC_KEY 时应 fail-closed（返回 false，D2-010）',
      key: '',
      payload: '{"a":1}',
      sig: 'any-signature',
    },
    {
      name: '签名长度不一致应返回 false（防 timingSafeEqual 抛错）',
      key: 'test-hmac-key',
      payload: 'payload',
      sig: 'short',
    },
  ])('$name', ({ key, payload, sig }) => {
    config.AUDIT_HMAC_KEY = key;
    expect(verifyPayload(payload, sig)).toBe(false);
  });

  it('正确 HMAC 签名应验证通过', async () => {
    config.AUDIT_HMAC_KEY = 'test-hmac-key';
    const crypto = await import('crypto');
    const payload = '{"userId":"u1","action":"login"}';
    const sig = crypto.createHmac('sha256', 'test-hmac-key').update(payload).digest('hex');
    expect(verifyPayload(payload, sig)).toBe(true);
  });

  it('finish 回调应优先使用 JWT sub 作为 userId', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'legacy-key' },
    });
    (req as Request & { user?: { sub: string } }).user = { sub: 'jwt-user-42' };

    auditLog(req, res, next);
    const finishCb = res._finishCallback;
    finishCb();

    expect(loggerMocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'jwt-user-42' }),
      expect.any(String),
    );
  });
});

describe('writeOutboxEvent 事务双写', () => {
  const entry123 = { userId: 'user-123', method: 'POST', path: '/api/test' };
  const entry456 = { userId: 'user-456', method: 'PUT', path: '/api/update' };

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 pool query mock 默认成功
    poolMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  describe('事务模式（传入 client）', () => {
    it('应使用传入的 client 而非连接池', async () => {
      const mockClient = createMockClient();

      await writeOutboxEvent(entry123, mockClient);

      // 应使用 client.query，而非 pool.query
      expect(mockClient.query).toHaveBeenCalled();
      expect(poolMocks.query).not.toHaveBeenCalled();
    });

    it('不应发送 NOTIFY（NOTIFY 应由调用方在 COMMIT 后发送）', async () => {
      const mockClient = createMockClient();

      await writeOutboxEvent(entry123, mockClient);

      // 应只调用一次 query（INSERT），不应有第二次 NOTIFY 调用
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      // 验证唯一的 query 是 INSERT，而非 NOTIFY
      const sqlArg = mockClient.query.mock.calls[0][0] as string;
      expect(sqlArg).toContain('INSERT INTO outbox');
      expect(sqlArg).not.toContain('NOTIFY');
    });

    it('应使用正确的 INSERT SQL 与参数', async () => {
      const mockClient = createMockClient();

      await writeOutboxEvent(entry123, mockClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining(['audit', 'user-123', 'AuditEvent']),
      );
    });

    it('异常应向上传播（触发调用方 ROLLBACK）', async () => {
      const mockClient = createMockClient();
      const dbError = new Error('transaction conflict');
      mockClient.query.mockRejectedValueOnce(dbError);

      // 事务模式下异常应向上传播，而非被吞掉
      await expect(writeOutboxEvent(entry123, mockClient)).rejects.toThrow('transaction conflict');
      // 应记录 error 日志（区别于独立模式的 warn）
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });

  describe('独立模式（无 client）', () => {
    it('应使用连接池（getPool）', async () => {
      await writeOutboxEvent(entry456);

      // 应使用 pool.query
      expect(poolMocks.query).toHaveBeenCalled();
    });

    it('应发送 NOTIFY outbox_channel', async () => {
      await writeOutboxEvent(entry456);

      // 应调用两次 query：INSERT + NOTIFY
      expect(poolMocks.query).toHaveBeenCalledTimes(2);
      // 第二次调用应是 NOTIFY
      const notifyCall = poolMocks.query.mock.calls[1];
      expect(notifyCall[0]).toBe('NOTIFY outbox_channel');
    });

    it('异常应被吞掉（不阻塞响应），仅记录 warn', async () => {
      const dbError = new Error('pool connection failed');
      poolMocks.query.mockRejectedValueOnce(dbError);

      // 独立模式不应抛出（中间件异步调用不阻塞响应）
      await expect(writeOutboxEvent(entry456)).resolves.toBeUndefined();
      // 应记录 warn 日志（区别于事务模式的 error）
      expect(loggerMocks.warn).toHaveBeenCalled();
    });
  });
});
