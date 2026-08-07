// ADR-032: organizations/memberships 未启用 RLS（鸡生蛋问题），直接用主连接池
import { getPool } from '../db/pool.js';
import type { OrgRole } from '../middleware/jwtAuth.js';
import { rowMapper, iso } from './rowMapper.js';

export type GlobalRole = 'admin' | 'analyst' | 'readonly';

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgPlan: string;
  orgStatus: string;
  role: OrgRole;
}

interface OrgMember {
  userId: string;
  username: string;
  email: string | null;
  role: OrgRole;
  createdAt: string;
}

const mapRow = rowMapper<Membership>({
  orgId: 'org_id',
  orgName: 'org_name',
  orgSlug: 'org_slug',
  orgPlan: 'org_plan',
  orgStatus: 'org_status',
  role: 'role',
});
const mapOrgMember = rowMapper<OrgMember>({
  userId: 'user_id',
  username: 'username',
  email: (r) => (r.email as string | null) ?? null,
  role: 'role',
  createdAt: (r) => iso(r.created_at),
});

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

// switch-org 必须验证用户确属目标组织，否则可伪造 orgId 越权
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

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.user_id, m.role, m.created_at, u.username, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY m.created_at ASC`,
    [orgId],
  );
  return rows.map(mapOrgMember);
}
