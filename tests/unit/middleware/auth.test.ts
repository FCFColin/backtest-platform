/**
 * API Key 鉴权中间件单元测试（T-P1-5.3）
 *
 * 企业理由：管理端点鉴权是安全底线，测试覆盖所有分支：
 * 开发环境跳过、生产环境必需、Key 缺失/错误/正确、超长 Key 防御。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMiddleware } from '../../helpers/expressMocks.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

// vi.hoisted 确保 mock 变量在 vi.mock 提升前完成初始化
const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'development' as const,
    ADMIN_API_KEY: '',
    REQUIRE_API_KEY: false,
  },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import { requireApiKey, optionalApiKey } from '../../../packages/backend/src/middleware/auth.js';

function createMockReqRes(opts: { headers?: Record<string, string> }) {
  return createMockMiddleware({
    method: 'POST',
    headers: opts.headers || {},
    path: '/api/admin/test',
    url: '/api/admin/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });
}

describe('requireApiKey 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'development';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.REQUIRE_API_KEY = false;
  });

  it('开发环境未配置 ADMIN_API_KEY 应跳过鉴权', () => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.ADMIN_API_KEY = '';
    const { req, res, next } = createMockReqRes({});
    requireApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('生产环境未配置 ADMIN_API_KEY 应返回 401', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = '';
    const { req, res, next } = createMockReqRes({});
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('配置了 ADMIN_API_KEY 但请求缺失 Key 应返回 401', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({});
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('API Key 错误应返回 403', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'wrong-key' },
    });
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('API Key 正确应放行', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'secret-key-123' },
    });
    requireApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('超长 API Key（>128 字符）应返回 403', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'a'.repeat(129) },
    });
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('长度不匹配的 Key 应返回 403（防时序攻击）', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'secret-key-12' },
    });
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('开发环境配置了 ADMIN_API_KEY 仍应要求认证', () => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.ADMIN_API_KEY = 'dev-secret-key';
    const { req, res, next } = createMockReqRes({});
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('生产环境正确 Key 应返回 JSON 错误格式结构（成功时不调用）', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'wrong' },
    });
    requireApiKey(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INVALID_API_KEY' }),
      }),
    );
  });

  it('大小写敏感的 API Key 应区分', () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'Secret-Key';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'secret-key' },
    });
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('optionalApiKey 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'development';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.REQUIRE_API_KEY = false;
  });

  it('未配置 ADMIN_API_KEY 应直接放行', () => {
    mocks.config.ADMIN_API_KEY = '';
    const { req, res, next } = createMockReqRes({});
    optionalApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('配置了 Key 但请求无 Key 应放行（匿名访问）', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({});
    optionalApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('配置了 Key 且请求 Key 正确应放行', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'secret-key-123' },
    });
    optionalApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('配置了 Key 且请求 Key 错误应放行（可选认证不阻断）', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'wrong-key' },
    });
    optionalApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('REQUIRE_API_KEY=true 时应退化为强制认证', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    mocks.config.REQUIRE_API_KEY = true;
    const { req, res, next } = createMockReqRes({});
    optionalApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('超长 Key 在可选模式下应放行', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'a'.repeat(129) },
    });
    optionalApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('正确 Key 在可选模式下应放行', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'secret-key-123' },
    });
    optionalApiKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    mocks.config.REQUIRE_API_KEY = false;
  });

  it('SQL 注入作为 API Key 应被拒绝（403）', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': "' OR '1'='1" },
    });
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    // 确保错误响应中不包含 SQL 注入载荷
    const callArgs = (res.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
    expect(JSON.stringify(callArgs)).not.toContain("OR '1'='1");
  });

  it('头注入（含 \\r\\n 字符）的 API Key 应被拒绝', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'secret-key-123\r\nX-Injected-Header: evil' },
    });
    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('空字符串 API Key 应被拒绝（401）', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': '' },
    });
    requireApiKey(req, res, next);
    // 空字符串是 falsy，应被 !apiKey 检查拦截
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('纯空白字符 API Key 应被拒绝（403）', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': '   ' },
    });
    requireApiKey(req, res, next);
    // 纯空白字符串是 truthy，通过 !apiKey 检查后应在 timingSafeEqual 处失败
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('暴力破解：30+ 次连续失败尝试应全部被拒绝', () => {
    mocks.config.ADMIN_API_KEY = 'secret-key-123';
    let rejectedCount = 0;
    let successCount = 0;

    for (let i = 0; i < 35; i++) {
      const { req, res, next } = createMockReqRes({
        headers: { 'x-api-key': `wrong-key-${i}` },
      });
      requireApiKey(req, res, next);

      if (
        (res.status as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(
          (c: unknown[]) => c[0] === 403,
        )
      ) {
        rejectedCount++;
      } else if (next.mock.calls.length > 0) {
        successCount++;
      }
    }

    // 所有 35 次尝试都应被拒绝，无一成功
    expect(rejectedCount).toBe(35);
    expect(successCount).toBe(0);
    // 确保每次都返回 403（非 401，因为 Key 存在但错误）
    expect(rejectedCount).toBeGreaterThan(30);
  });
});
