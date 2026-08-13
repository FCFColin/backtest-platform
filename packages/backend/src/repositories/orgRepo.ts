// ADR-009: 组织作为租户边界，未启用 RLS，由应用层强制隔离
import { getPool } from '../db/pool.js';
import { rowMapper, queryRow } from './rowMapper.js';

interface OrgSummary {
  orgId: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

const mapOrgSummary = rowMapper<OrgSummary>({
  orgId: 'id',
  name: 'name',
  slug: 'slug',
  plan: 'plan',
  status: 'status',
});

export async function getOrg(orgId: string): Promise<OrgSummary | null> {
  return queryRow(
    getPool(),
    'SELECT id, name, slug, plan, status FROM organizations WHERE id = $1',
    [orgId],
    mapOrgSummary,
  );
}

export async function updateOrgName(orgId: string, name: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    'UPDATE organizations SET name = $2, updated_at = NOW() WHERE id = $1',
    [orgId, name],
  );
  return (rowCount ?? 0) > 0;
}
