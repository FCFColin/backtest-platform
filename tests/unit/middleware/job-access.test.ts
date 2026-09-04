import { describe, it, expect } from 'vitest';
import { jobAccessGranted } from '../../../packages/backend/src/middleware/jobAccess.js';
import type { AuthenticatedRequest } from '../../../packages/backend/src/middleware/jwtAuth.js';

type Requester = NonNullable<AuthenticatedRequest['user']>;

const requester = (over: Partial<Requester> = {}): Requester =>
  ({ sub: 'user-1', role: 'analyst', ...over }) as Requester;
const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('jobAccessGranted（ADR-007 IDOR 防护）', () => {
  it('admin 豁免属主校验，但已知租户仍须匹配', () => {
    const job = { data: { ownerUserId: 'someone-else', tenantId: orgA } };
    expect(jobAccessGranted(job, requester({ sub: 'admin-1', role: 'admin' }), orgA)).toBe(true);
  });

  it('owner 命中（ownerUserId，新字段）', () => {
    const job = { data: { ownerUserId: 'user-1', tenantId: orgA } };
    expect(jobAccessGranted(job, requester(), orgA)).toBe(true);
  });

  it('owner 命中（旧 userId 字段兼容）', () => {
    const job = { data: { userId: 'user-1', tenantId: orgA } };
    expect(jobAccessGranted(job, requester(), orgA)).toBe(true);
  });

  it('ownerUserId 优先于旧 userId', () => {
    const job = { data: { ownerUserId: 'user-1', userId: 'user-2', tenantId: orgA } };
    expect(jobAccessGranted(job, requester(), orgA)).toBe(true);
    const swapped = { data: { ownerUserId: 'user-2', userId: 'user-1', tenantId: orgA } };
    expect(jobAccessGranted(swapped, requester(), orgA)).toBe(false);
  });

  it('租户匹配但非 owner 拒绝', () => {
    const job = { data: { ownerUserId: 'someone-else', tenantId: orgA } };
    expect(jobAccessGranted(job, requester(), orgA)).toBe(false);
  });

  it('双 undefined（jobTenant 与 reqTenantId 均缺）时非属主拒绝——封堵跨租户', () => {
    const job = { data: { ownerUserId: 'someone-else' } };
    expect(jobAccessGranted(job, requester(), undefined)).toBe(false);
    expect(jobAccessGranted(job, requester({ role: 'admin' }), undefined)).toBe(false);
  });

  it('双 undefined 仅允许历史无租户任务 owner 自读（既有豁免语义）', () => {
    const job = { data: { ownerUserId: 'user-1' } };
    expect(jobAccessGranted(job, requester(), undefined)).toBe(true);
  });

  it('无 requester 一律拒绝（fail-closed）', () => {
    const job = { data: { ownerUserId: 'user-1', tenantId: orgA } };
    expect(jobAccessGranted(job, undefined as unknown as AuthenticatedRequest['user'], orgA)).toBe(
      false,
    );
  });
});
