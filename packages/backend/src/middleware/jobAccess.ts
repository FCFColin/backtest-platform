import type { AuthenticatedRequest } from './jwtAuth.js';

/** 任务所有权/租户判定（ADR-007 IDOR 防护）。所有调用点均在强制鉴权后执行，无凭证一律拒绝（fail-closed）。 */
export function jobAccessGranted(
  job: {
    data?: { userId?: string; ownerUserId?: string | null; tenantId?: string };
  },
  requester: AuthenticatedRequest['user'],
  reqTenantId?: string,
): boolean {
  if (!requester) return false;
  // ownerUserId 为当前字段；userId 为 Redis 中存量旧任务的兼容读法（ownerUserId null 时不回退，见 ?? 语义）
  const ownerId = job.data?.ownerUserId ?? job.data?.userId;
  const jobTenant = job.data?.tenantId;
  const isOwner = ownerId !== undefined && ownerId === requester.sub;
  const hasOwnership = isOwner || requester.role === 'admin';
  // 属主豁免仅限历史无租户任务（undefined）自读；已知租户必须匹配，admin 不豁免——封堵双 undefined 跨租户
  const passesTenantCheck =
    (jobTenant !== undefined && jobTenant === reqTenantId) || requester.platform_admin === true;
  return hasOwnership && (passesTenantCheck || (isOwner && jobTenant === undefined));
}
