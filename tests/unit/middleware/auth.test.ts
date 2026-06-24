/**
 * API Key 鉴权中间件单元测试（T-P1-5.3）
 *
 * 企业理由：管理端点鉴权是安全底线，测试覆盖所有分支：
 * 开发环境跳过、生产环境必需、Key 缺失/错误/正确、超长 Key 防御。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// vi.hoisted 确保 mock 变量在 vi.mock 提升前完成初始化
const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'development' as const,
    ADMIN_API_KEY: '',
    REQUIRE_API_KEY: false,
  },
}));

vi.mock('../../../api/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

import { requireApiKey, optionalApiKey } from '../../../api/middleware/auth.js';

function createMockReqRes(opts: {
  headers?: Record<string, string>;
}) {
  const req = {
    method: 'POST',
    headers: opts.headers || {},
    path: '/api/admin/test',
    originalUrl: '/api/admin/test',
    url: '/api/admin/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;

  const res = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
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
});
