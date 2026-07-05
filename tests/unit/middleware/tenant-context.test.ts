/**
 * 租户解析中间件单元测试（ADR-032）
 *
 * 企业理由：tenantContext 是把 JWT 租户上下文搬到请求、再交由 RLS 强制隔离的关键一环。
 * 验证：合法 tenant_id 被解析、非法/缺失时软放行、requireTenant 在无租户时 400。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import { resolveTenant, requireTenant } from '../../../api/middleware/tenantContext.js';
import type { AuthenticatedRequest } from '../../../api/middleware/jwtAuth.js';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    header() {
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    req: { path: '/x' },
  };
  return res as unknown as Response & { statusCode: number; body: { code?: string } };
}

describe('resolveTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('合法 tenant_id 应解析到 req.tenantId', () => {
    const req = { user: { tenant_id: VALID_UUID }, path: '/x' } as unknown as AuthenticatedRequest;
    const next = vi.fn();
    resolveTenant(req, mockRes(), next);
    expect(req.tenantId).toBe(VALID_UUID);
    expect(next).toHaveBeenCalledOnce();
  });

  it('无 tenant_id 时软放行且不设置 req.tenantId', () => {
    const req = { user: { sub: 'u1' }, path: '/x' } as unknown as AuthenticatedRequest;
    const next = vi.fn();
    resolveTenant(req, mockRes(), next);
    expect(req.tenantId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('非法 tenant_id 格式应被忽略并软放行', () => {
    const req = {
      user: { tenant_id: 'not-a-uuid' },
      path: '/x',
    } as unknown as AuthenticatedRequest;
    const next = vi.fn();
    resolveTenant(req, mockRes(), next);
    expect(req.tenantId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('无 user 时软放行', () => {
    const req = { path: '/x' } as unknown as AuthenticatedRequest;
    const next = vi.fn();
    resolveTenant(req, mockRes(), next);
    expect(req.tenantId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('已解析租户时放行', () => {
    const req = { tenantId: VALID_UUID } as unknown as AuthenticatedRequest;
    const next = vi.fn();
    requireTenant(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('无租户上下文时返回 400 NO_ACTIVE_TENANT', () => {
    const req = {} as unknown as AuthenticatedRequest;
    const next = vi.fn();
    const res = mockRes();
    requireTenant(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NO_ACTIVE_TENANT');
  });
});
