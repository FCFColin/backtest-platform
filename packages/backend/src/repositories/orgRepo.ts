/**
 * 组织（organizations）仓储（ADR-032）
 *
 * 承载组织记录的读写。组织作为租户边界，未启用 RLS（见 009_tenancy.sql 文件头），
 * 由应用层在解析出租户后强制隔离。
 */
import { getPool } from '../db/pool.js';

/** 组织摘要（不含敏感字段，可安全返回前端） */
interface OrgSummary {
  orgId: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

/**
 * 获取组织摘要（id/name/slug/plan/status）。
 *
 * @param orgId - 组织 UUID
 * @returns 组织摘要或 null（不存在）
 */
export async function getOrg(orgId: string): Promise<OrgSummary | null> {
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
