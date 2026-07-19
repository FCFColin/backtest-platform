/**
 * 组织成员业务流程服务（精简版，ADR-032）
 *
 * 承载角色变更、移除、默认活跃组织解析等业务逻辑（含"最后一个 owner"保护、
 * 平台管理员判定等安全约束）。CRUD 查询见 repositories/membershipRepo.ts 与
 * repositories/orgRepo.ts。
 *
 * 隔离边界：organizations/memberships 属身份/控制平面，未启用 RLS（见
 * 009_tenancy.sql 文件头说明——它们在"尚未解析出租户"时即被查询，存在先有鸡
 * 先有蛋问题）。因此本服务直接使用主连接池查询，并由应用层成员校验强制安全。
 */
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import {
  getUserMemberships,
  type Membership,
  type OrgRole,
  type GlobalRole,
} from '../repositories/membershipRepo.js';

// 重新导出类型与 CRUD，保持调用方按需直接 import repo
export { type Membership } from '../repositories/membershipRepo.js';
export {
  getUserMemberships,
  getMembership,
  listOrgMembers,
} from '../repositories/membershipRepo.js';
export { getOrg, updateOrgName } from '../repositories/orgRepo.js';

/**
 * 将组织内角色映射为全局（legacy）RBAC 角色。
 *
 * 企业理由：现有 RBAC（api/middleware/rbac.ts）以三元角色（admin/analyst/readonly）
 * 判权，而组织成员新增了 owner 级别。owner 在租户内拥有最高权限，映射为 admin，
 * 使既有 requirePermission 链在多租户接入期间无需改动即可工作。
 *
 * @param role - 组织内成员角色
 * @returns 对应的全局 RBAC 角色
 */
export function orgRoleToGlobalRole(role: OrgRole): GlobalRole {
  return role === 'owner' ? 'admin' : role;
}

/** 角色优先级，用于在多组织中挑选"默认活跃组织"（owner > admin > analyst > readonly） */
const ROLE_PRIORITY: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  analyst: 1,
  readonly: 0,
};

/**
 * 解析用户登录后的默认活跃组织。
 *
 * 策略：优先选择处于 active 状态的组织中角色优先级最高者（owner > admin > ...），
 * 同优先级取最早加入的组织（稳定可预测）。无任何成员关系时返回 null（用户尚未
 * 加入或创建组织，前端应引导其完成 onboarding）。
 *
 * @param userId - 用户 UUID
 * @returns 默认成员关系或 null
 */
export async function resolveDefaultOrg(userId: string): Promise<Membership | null> {
  const memberships = await getUserMemberships(userId);
  if (memberships.length === 0) return null;

  const active = memberships.filter((m) => m.orgStatus === 'active');
  const pool = active.length > 0 ? active : memberships;

  // getUserMemberships 已按 created_at 升序；稳定排序后按角色优先级降序挑选
  const sorted = [...pool].sort((a, b) => ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role]);
  return sorted[0];
}

/**
 * 检查用户是否为组织内最后一个 owner。
 *
 * @returns 'last_owner' 是最后一个 owner / 'ok' 可操作
 */
async function ensureNotLastOwner(orgId: string, isOwner: boolean): Promise<'last_owner' | 'ok'> {
  if (!isOwner) return 'ok';
  const pool = getPool();
  const { rows: owners } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM memberships WHERE org_id = $1 AND role = 'owner'`,
    [orgId],
  );
  return owners[0].c <= 1 ? 'last_owner' : 'ok';
}

/**
 * 修改成员在组织内的角色。
 *
 * 安全：拒绝把组织内最后一个 owner 降级（避免组织失去管理者）。
 *
 * @param orgId - 组织 UUID
 * @param userId - 目标用户 UUID
 * @param role - 新角色
 * @returns 'ok' | 'not_found' | 'last_owner'
 */
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

/**
 * 移除组织成员。拒绝移除最后一个 owner。
 *
 * @param orgId - 组织 UUID
 * @param userId - 目标用户 UUID
 * @returns 'ok' | 'not_found' | 'last_owner'
 */
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

/**
 * 判断用户是否为平台管理员（运营 SaaS 自身，区别于租户内 admin）。
 *
 * @param userId - 用户 UUID
 * @returns 是否为平台管理员（查询失败时保守返回 false）
 */
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
