import type { AuthenticatedRequest } from './jwtAuth.js';

/** 任务所有权/租户判定（ADR-007 IDOR 防护）。所有调用点均在强制鉴权后执行，无凭证一律拒绝（fail-closed）。 */
export function jobAccessGranted(
  job: { data?: { userId?: string; tenantId?: string } },
  requester: AuthenticatedRequest['user'],
  reqTenantId?: string,
): boolean {
  if (!requester) return false;
  const ownerId = job.data?.userId;
  const jobTenant = job.data?.tenantId;
  const hasOwnership =
    (ownerId !== undefined && ownerId === requester.sub) || requester.role === 'admin';
  const passesTenantCheck =
    jobTenant === reqTenantId || requester.platform_admin === true;
  return hasOwnership && passesTenantCheck;
}
