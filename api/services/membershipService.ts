/**
 * 组织成员服务（多租户身份解析，ADR-032）
 *
 * 企业理由：多租户 SaaS 中，"用户"与"组织（租户）"是多对多关系——
 * 一个用户可属于多个组织，并在每个组织内持有不同角色。登录与 org 切换时
 * 需要据此解析当前活跃租户与租户内角色，并将其写入 JWT。
 *
 * 隔离边界：organizations/memberships 属于身份/控制平面，未启用 RLS（见
 * 009_tenancy.sql 文件头说明——它们在"尚未解析出租户"时即被查询，存在先有鸡
 * 先有蛋问题）。因此本服务直接使用主连接池查询，并由应用层成员校验强制安全。
 */
import { getPool } from '../db/index.js';
import { logger } from '../utils/logger.js';

/** 组织内成员角色（owner 为组织创建者，权限最高） */
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'readonly';

/** 全局（legacy）角色集合，用于与既有 RBAC（req.user.role）兼容 */
export type GlobalRole = 'admin' | 'analyst' | 'readonly';

/** 用户在某组织内的成员关系（含组织摘要信息） */
export interface Membership {
  /** 组织（租户）UUID */
  orgId: string;
  /** 组织显示名 */
  orgName: string;
  /** 组织 slug（URL 友好唯一标识） */
  orgSlug: string;
  /** 订阅计划 */
  orgPlan: string;
  /** 组织状态（active/suspended/canceled） */
  orgStatus: string;
  /** 当前用户在该组织内的角色 */
  role: OrgRole;
}

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

function mapRow(row: {
  org_id: string;
  org_name: string;
  org_slug: string;
  org_plan: string;
  org_status: string;
  role: OrgRole;
}): Membership {
  return {
    orgId: row.org_id,
    orgName: row.org_name,
    orgSlug: row.org_slug,
    orgPlan: row.org_plan,
    orgStatus: row.org_status,
    role: row.role,
  };
}

/**
 * 查询用户的全部组织成员关系（按角色优先级与创建时间排序）。
 *
 * @param userId - 用户 UUID
 * @returns 成员关系数组（可能为空）
 */
export async function getUserMemberships(userId: string): Promise<Membership[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.org_id, m.role,
            o.name AS org_name, o.slug AS org_slug, o.plan AS org_plan, o.status AS org_status
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC`,
    [userId],
  );
  return rows.map(mapRow);
}

/**
 * 查询用户在指定组织内的成员关系（org 切换鉴权用）。
 *
 * 企业理由：switch-org 必须验证用户确属目标组织，否则用户可伪造 orgId 越权访问
 * 他租户数据。返回 null 即表示无权进入该组织。
 *
 * @param userId - 用户 UUID
 * @param orgId - 目标组织 UUID
 * @returns 成员关系或 null（不属于该组织）
 */
export async function getMembership(userId: string, orgId: string): Promise<Membership | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.org_id, m.role,
            o.name AS org_name, o.slug AS org_slug, o.plan AS org_plan, o.status AS org_status
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1 AND m.org_id = $2`,
    [userId, orgId],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

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

/** 组织内某成员（含用户名/邮箱，用于成员管理 UI） */
export interface OrgMember {
  userId: string;
  username: string;
  email: string | null;
  role: OrgRole;
  createdAt: string;
}

/**
 * 列出组织成员（含基本身份信息）。
 *
 * @param orgId - 组织 UUID
 * @returns 成员数组
 */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.user_id, m.role, m.created_at, u.username, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY m.created_at ASC`,
    [orgId],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    email: r.email ?? null,
    role: r.role,
    createdAt: new Date(r.created_at).toISOString(),
  }));
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
    const { rows: owners } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM memberships WHERE org_id = $1 AND role = 'owner'`,
      [orgId],
    );
    if (owners[0].c <= 1) return 'last_owner';
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
  if (current[0].role === 'owner') {
    const { rows: owners } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM memberships WHERE org_id = $1 AND role = 'owner'`,
      [orgId],
    );
    if (owners[0].c <= 1) return 'last_owner';
  }
  await pool.query('DELETE FROM memberships WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
  logger.info({ orgId, userId }, '[membershipService] 成员已移除');
  return 'ok';
}

/**
 * 获取组织摘要（id/name/slug/plan/status）。
 *
 * @param orgId - 组织 UUID
 */
export async function getOrg(
  orgId: string,
): Promise<{ orgId: string; name: string; slug: string; plan: string; status: string } | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, slug, plan, status FROM organizations WHERE id = $1',
    [orgId],
  );
  if (rows.length === 0) return null;
  return {
    orgId: rows[0].id,
    name: rows[0].name,
    slug: rows[0].slug,
    plan: rows[0].plan,
    status: rows[0].status,
  };
}

/**
 * 更新组织名称。
 *
 * @param orgId - 组织 UUID
 * @param name - 新名称
 * @returns 是否更新成功
 */
export async function updateOrgName(orgId: string, name: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    'UPDATE organizations SET name = $2, updated_at = NOW() WHERE id = $1',
    [orgId, name],
  );
  return (rowCount ?? 0) > 0;
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
