/**
 * 组合（portfolios）租户作用域仓储（ADR-032 / ADR-034）
 *
 * 企业理由：组合此前仅存于浏览器 localStorage——换设备/清缓存即丢失，无法团队共享、
 * 无法服务端复用。迁移到 Postgres 后由 RLS 强制租户隔离：所有读写都经 withTenant()
 * 在事务内激活 app.current_tenant_id，即便忘记 WHERE tenant_id 也不会跨租户泄露。
 *
 * 所有方法都要求 tenantId（活跃组织 UUID）；owner_user_id 记录创建者用于审计/展示，
 * 但隔离边界是租户而非用户（同组织成员可见彼此组合，符合团队协作语义）。
 */
import { withTenant } from '../db/index.js';

/** 组合中的单个资产配置 */
export interface PortfolioAsset {
  ticker: string;
  weight: number;
}

/** 组合记录（已序列化为 API 友好结构） */
export interface PortfolioRecord {
  id: string;
  name: string;
  assets: PortfolioAsset[];
  rebalanceFrequency: string;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新组合的输入 */
export interface PortfolioInput {
  name: string;
  assets: PortfolioAsset[];
  rebalanceFrequency?: string;
}

function mapRow(row: {
  id: string;
  name: string;
  assets: PortfolioAsset[];
  rebalance_frequency: string;
  owner_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): PortfolioRecord {
  return {
    id: row.id,
    name: row.name,
    assets: row.assets,
    rebalanceFrequency: row.rebalance_frequency,
    ownerUserId: row.owner_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SELECT_COLS = 'id, name, assets, rebalance_frequency, owner_user_id, created_at, updated_at';

/**
 * 列出租户下的全部组合（按更新时间倒序）。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @returns 组合记录数组
 */
export async function listPortfolios(
  tenantId: string,
  limit: number = 50,
): Promise<PortfolioRecord[]> {
  return withTenant(tenantId, async (client) => {
    const capped = Math.min(limit, 200);
    const { rows } = await client.query(
      `SELECT ${SELECT_COLS} FROM portfolios ORDER BY updated_at DESC LIMIT $1`,
      [capped],
    );
    return rows.map(mapRow);
  });
}

/**
 * 按 ID 获取组合（租户隔离，不存在返回 null）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 组合 UUID
 */
export async function getPortfolio(tenantId: string, id: string): Promise<PortfolioRecord | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(`SELECT ${SELECT_COLS} FROM portfolios WHERE id = $1`, [
      id,
    ]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  });
}

/**
 * 创建组合。
 *
 * @param tenantId - 活跃组织 UUID
 * @param ownerUserId - 创建者用户 UUID（可空）
 * @param input - 组合内容
 */
export async function createPortfolio(
  tenantId: string,
  ownerUserId: string | null,
  input: PortfolioInput,
): Promise<PortfolioRecord> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO portfolios (tenant_id, owner_user_id, name, assets, rebalance_frequency)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING ${SELECT_COLS}`,
      [
        tenantId,
        ownerUserId,
        input.name,
        JSON.stringify(input.assets),
        input.rebalanceFrequency ?? 'none',
      ],
    );
    return mapRow(rows[0]);
  });
}

/**
 * 更新组合（全量覆盖）。不存在返回 null。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 组合 UUID
 * @param input - 新内容
 */
export async function updatePortfolio(
  tenantId: string,
  id: string,
  input: PortfolioInput,
): Promise<PortfolioRecord | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `UPDATE portfolios
          SET name = $2, assets = $3::jsonb, rebalance_frequency = $4, updated_at = NOW()
        WHERE id = $1
      RETURNING ${SELECT_COLS}`,
      [id, input.name, JSON.stringify(input.assets), input.rebalanceFrequency ?? 'none'],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  });
}

/**
 * 删除组合（租户隔离）。返回是否删除成功。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 组合 UUID
 */
export async function deletePortfolio(tenantId: string, id: string): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query('DELETE FROM portfolios WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  });
}
