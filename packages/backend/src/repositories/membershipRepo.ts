/**
 * 组织成员关系仓储（多租户身份解析，ADR-032）
 *
 * 企业理由：多租户 SaaS 中，"用户"与"组织（租户）"是多对多关系——
 * 一个用户可属于多个组织，并在每个组织内持有不同角色。登录与 org 切换时
 * 需要据此解析当前活跃租户与租户内角色，并将其写入 JWT。
 *
 * 隔离边界：organizations/memberships 属于身份/控制平面，未启用 RLS（见
 * 009_tenancy.sql 文件头说明——它们在"尚未解析出租户"时即被查询，存在先有鸡
 * 先有蛋问题）。因此本仓储直接使用主连接池查询，并由应用层成员校验强制安全。
 *
 * 本仓储只承载成员关系的查询（无角色变更业务逻辑）；角色变更/移除等业务流程见
 * services/membershipService.ts。
 */
import { getPool } from '../db/pool.js';

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

/** 组织内某成员（含用户名/邮箱，用于成员管理 UI） */
interface OrgMember {
  userId: string;
  username: string;
  email: string | null;
  role: OrgRole;
  createdAt: string;
}

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
