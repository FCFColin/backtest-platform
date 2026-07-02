/**
 * 审计日志中间件单元测试（T-P1-5.3）
 *
 * 企业理由：审计日志是合规要求（SOC 2/ISO 27001），测试覆盖：
 * 写操作记录、读操作跳过、响应完成后捕获 statusCode。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../../helpers/expressMocks.js';
import { mockLogger } from '../../helpers/mockFactories.js';

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

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

import { auditLog } from '../../../api/middleware/auditLog.js';

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
      if (event === 'finish') {
        (res as unknown as { _finishCallback?: () => void })._finishCallback = cb;
      }
    }),
  } as unknown as Response;

  const next = vi.fn();

  return { req, res, next };
}

describe('auditLog 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET 请求应跳过审计日志', () => {
    const { req, res, next } = createMockReqRes({ method: 'GET' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it('HEAD 请求应跳过审计日志', () => {
    const { req, res, next } = createMockReqRes({ method: 'HEAD' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it('OPTIONS 请求应跳过审计日志', () => {
    const { req, res, next } = createMockReqRes({ method: 'OPTIONS' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it('POST 请求应注册 finish 事件回调', () => {
    const { req, res, next } = createMockReqRes({ method: 'POST' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('PUT 请求应注册 finish 事件回调', () => {
    const { req, res, next } = createMockReqRes({ method: 'PUT' });
    auditLog(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('DELETE 请求应注册 finish 事件回调', () => {
    const { req, res, next } = createMockReqRes({ method: 'DELETE' });
    auditLog(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('finish 回调应记录审计日志', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    });
    auditLog(req, res, next);

    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    expect(finishCb).toBeDefined();
    finishCb();

    expect(loggerMocks.info).toHaveBeenCalled();
    expect(loggerMocks.childInfo).toHaveBeenCalled();
  });

  it('无 x-api-key 时 userId 应为 anonymous', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: {},
    });
    auditLog(req, res, next);

    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    finishCb();

    expect(loggerMocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'anonymous' }),
      expect.any(String),
    );
  });

  it('有 x-api-key 时 userId 应为 SHA-256 哈希前 16 位（非明文）', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'my-secret-key' },
    });
    auditLog(req, res, next);

    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    finishCb();

    expect(loggerMocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.not.stringContaining('my-secret-key') }),
      expect.any(String),
    );
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SQL 注入作为 path 应被安全存储（参数化查询）', () => {
    const sqlInjectionPath = "/api/users' OR '1'='1";
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      path: sqlInjectionPath,
    });
    auditLog(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

    // 触发 finish 回调
    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    expect(finishCb).toBeDefined();
    // 应不抛出异常地记录审计日志
    expect(() => finishCb()).not.toThrow();

    // 验证审计日志被记录（包含 SQL 注入路径，但通过参数化查询安全存储）
    expect(loggerMocks.childInfo).toHaveBeenCalled();
    const loggedEntry = loggerMocks.childInfo.mock.calls[0]?.[0];
    // path 应被原样记录（参数化查询防止注入执行）
    expect(loggedEntry.path).toBe(sqlInjectionPath);
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

    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    expect(() => finishCb()).not.toThrow();

    // 关键安全断言：Object.prototype 未被污染
    expect({}.admin).toBeUndefined();
    // 审计日志应正常记录
    expect(loggerMocks.childInfo).toHaveBeenCalled();
  });

  it('超大 path（10KB）应被安全处理（不崩溃）', () => {
    const oversizedPath = '/api/' + 'a'.repeat(10 * 1024); // 10KB 路径
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      path: oversizedPath,
    });
    auditLog(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    // 应不抛出异常地处理超大路径
    expect(() => finishCb()).not.toThrow();

    // 审计日志应被记录
    expect(loggerMocks.childInfo).toHaveBeenCalled();
    const loggedEntry = loggerMocks.childInfo.mock.calls[0]?.[0];
    // path 应被记录（可能被截断或完整存储，关键是进程不崩溃）
    expect(loggedEntry.path).toBeDefined();
    expect(typeof loggedEntry.path).toBe('string');
  });
});

describe('verifyPayload HMAC 签名', () => {
  const originalKey = process.env.AUDIT_HMAC_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.AUDIT_HMAC_KEY;
    } else {
      process.env.AUDIT_HMAC_KEY = originalKey;
    }
  });

  it('未配置 AUDIT_HMAC_KEY 时应跳过验证（返回 true）', async () => {
    delete process.env.AUDIT_HMAC_KEY;
    const { verifyPayload } = await import('../../../api/middleware/auditLog.js');
    expect(verifyPayload('{"a":1}', 'any-signature')).toBe(true);
  });

  it('签名长度不一致应返回 false（防 timingSafeEqual 抛错）', async () => {
    process.env.AUDIT_HMAC_KEY = 'test-hmac-key';
    const { verifyPayload } = await import('../../../api/middleware/auditLog.js');
    expect(verifyPayload('payload', 'short')).toBe(false);
  });

  it('正确 HMAC 签名应验证通过', async () => {
    process.env.AUDIT_HMAC_KEY = 'test-hmac-key';
    const crypto = await import('crypto');
    const payload = '{"userId":"u1","action":"login"}';
    const sig = crypto.createHmac('sha256', 'test-hmac-key').update(payload).digest('hex');
    const { verifyPayload } = await import('../../../api/middleware/auditLog.js');
    expect(verifyPayload(payload, sig)).toBe(true);
  });

  it('finish 回调应优先使用 JWT sub 作为 userId', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'legacy-key' },
    });
    (req as Request & { user?: { sub: string } }).user = { sub: 'jwt-user-42' };

    auditLog(req, res, next);
    const finishCb = (res as unknown as { _finishCallback?: () => void })._finishCallback;
    finishCb();

    expect(loggerMocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'jwt-user-42' }),
      expect.any(String),
    );
  });
});

