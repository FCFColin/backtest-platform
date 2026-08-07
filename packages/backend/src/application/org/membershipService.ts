// ADR-032: organizations/memberships 未启用 RLS（鸡生蛋问题），直接用主连接池查询
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import type { OrgRole } from '../../middleware/jwtAuth.js';
import {
  getUserMemberships,
  type Membership,
  type GlobalRole,
} from '../../repositories/membershipRepo.js';

export { type Membership } from '../../repositories/membershipRepo.js';
export {
  getUserMemberships,
  getMembership,
  listOrgMembers,
} from '../../repositories/membershipRepo.js';
export { getOrg, updateOrgName } from '../../repositories/orgRepo.js';

export function orgRoleToGlobalRole(role: OrgRole): GlobalRole {
  return role === 'owner' ? 'admin' : role;
}

const ROLE_PRIORITY: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  analyst: 1,
  readonly: 0,
};

export async function resolveDefaultOrg(userId: string): Promise<Membership | null> {
  const memberships = await getUserMemberships(userId);
  if (memberships.length === 0) return null;

  const active = memberships.filter((m) => m.orgStatus === 'active');
  const sorted = [...(active.length > 0 ? active : memberships)].sort(
    (a, b) => ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role],
  );
  return sorted[0];
}

async function ensureNotLastOwner(orgId: string, isOwner: boolean): Promise<'last_owner' | 'ok'> {
  if (!isOwner) return 'ok';
  const pool = getPool();
  const { rows: owners } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM memberships WHERE org_id = $1 AND role = 'owner'`,
    [orgId],
  );
  return owners[0].c <= 1 ? 'last_owner' : 'ok';
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<'ok' | 'not_found' | 'last_owner'> {
  const pool = getPool();
  const { rows: current } = await pool.query(
    'SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2',
    [orgId, userId],
  );
  if (current.length === 0) return 'not_found';
  if (current[0].role === 'owner' && role !== 'owner') {
    const check = await ensureNotLastOwner(orgId, true);
    if (check !== 'ok') return check;
  }
  await pool.query('UPDATE memberships SET role = $3 WHERE org_id = $1 AND user_id = $2', [
    orgId,
    userId,
    role,
  ]);
  logger.info({ orgId, userId, role }, '[membershipService] 成员角色已更新');
  return 'ok';
}

export async function removeMember(
  orgId: string,
  userId: string,
): Promise<'ok' | 'not_found' | 'last_owner'> {
  const pool = getPool();
  const { rows: current } = await pool.query(
    'SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2',
    [orgId, userId],
  );
  if (current.length === 0) return 'not_found';
  const check = await ensureNotLastOwner(orgId, current[0].role === 'owner');
  if (check !== 'ok') return check;
  await pool.query('DELETE FROM memberships WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
  logger.info({ orgId, userId }, '[membershipService] 成员已移除');
  return 'ok';
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT is_platform_admin FROM users WHERE id = $1', [
      userId,
    ]);
    return rows.length > 0 && rows[0].is_platform_admin === true;
  } catch (err) {
    logger.warn(
      { err: String(err), userId },
      '[membershipService] 平台管理员查询失败，保守返回 false',
    );
    return false;
  }
}
