import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';

import {
  resolveTenant,
  requireTenant,
} from '../../../packages/backend/src/middleware/tenantContext.js';
import type { AuthenticatedRequest } from '../../../packages/backend/src/middleware/jwtAuth.js';

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
  return res as unknown as Response & { statusCode: number; body: { error: { code?: string } } };
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

  it.each<[string, Record<string, unknown>]>([
    ['无 tenant_id', { user: { sub: 'u1' } }],
    ['非法 tenant_id 格式', { user: { tenant_id: 'not-a-uuid' } }],
    ['无 user', {}],
  ])('%s 应软放行且不设置 req.tenantId', (_name, user) => {
    const req = { ...user, path: '/x' } as unknown as AuthenticatedRequest;
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
    expect(res.body.error.code).toBe('NO_ACTIVE_TENANT');
  });
});
