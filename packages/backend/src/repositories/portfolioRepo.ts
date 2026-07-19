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
import { withTenant } from '../db/pool.js';
import {
  Portfolio as DomainPortfolio,
  type PortfolioHolding,
} from '../domain/aggregates/portfolio.js';
import { DomainValidationError } from '../domain/errors.js';
import { Ticker } from '../domain/value-objects/ticker.js';
import { Weight } from '../domain/value-objects/weight.js';
import { ValidationError } from '../utils/errors.js';
import type { Asset, RebalanceFrequency } from '@backtest/shared';

/** 组合记录（已序列化为 API 友好结构，DB 持久化层 DTO） */
interface PortfolioRecord {
  id: string;
  name: string;
  assets: Asset[];
  rebalanceFrequency: string;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新组合的输入 */
interface PortfolioInput {
  name: string;
  assets: Asset[];
  rebalanceFrequency?: RebalanceFrequency;
}

function mapRow(row: {
  id: string;
  name: string;
  assets: Asset[];
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
  offset: number = 0,
): Promise<PortfolioRecord[]> {
  return withTenant(tenantId, async (client) => {
    const capped = Math.min(limit, 200);
    const offsetSafe = Math.max(0, offset);
    const { rows } = await client.query(
      `SELECT ${SELECT_COLS} FROM portfolios ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
      [capped, offsetSafe],
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
 * 创建组合。在写入前通过 domain 聚合根强制校验权重和不变量（ADR-013）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param ownerUserId - 创建者用户 UUID（可空）
 * @param input - 组合内容
 * @throws {Error} 当权重和不为 ~100 或包含非法 ticker 时
 */
export async function createPortfolio(
  tenantId: string,
  ownerUserId: string | null,
  input: PortfolioInput,
): Promise<PortfolioRecord> {
  // 领域校验：通过聚合根构造函数强制不变量；保留实例以输出净化后的持久化 DTO
  const holdings: PortfolioHolding[] = input.assets.map((a) => ({
    ticker: Ticker.create(a.ticker),
    weight: Weight.create(a.weight),
  }));
  let portfolio: DomainPortfolio;
  try {
    portfolio = DomainPortfolio.create(crypto.randomUUID(), input.name, holdings, {
      rebalanceFrequency: input.rebalanceFrequency,
    });
  } catch (err) {
    if (err instanceof DomainValidationError) {
      throw new ValidationError(err.message, 'VALIDATION_ERROR', 'Portfolio validation failed');
    }
    throw err;
  }
  const dto = portfolio.toPersistenceDTO();

  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO portfolios (tenant_id, owner_user_id, name, assets, rebalance_frequency)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING ${SELECT_COLS}`,
      [
        tenantId,
        ownerUserId,
        dto.name,
        JSON.stringify(dto.assets),
        input.rebalanceFrequency ?? 'none',
      ],
    );
    return mapRow(rows[0]);
  });
}

/**
 * 更新组合（全量覆盖）。在写入前通过 domain 聚合根强制校验不变量（ADR-013）。
 * 不存在返回 null。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 组合 UUID
 * @param input - 新内容
 * @throws {Error} 当权重和不为 ~100 或包含非法 ticker 时
 */
export async function updatePortfolio(
  tenantId: string,
  id: string,
  input: PortfolioInput,
): Promise<PortfolioRecord | null> {
  // 领域校验：保留实例以输出净化后的持久化 DTO
  const holdings: PortfolioHolding[] = input.assets.map((a) => ({
    ticker: Ticker.create(a.ticker),
    weight: Weight.create(a.weight),
  }));
  let portfolio: DomainPortfolio;
  try {
    portfolio = DomainPortfolio.create(id, input.name, holdings, {
      rebalanceFrequency: input.rebalanceFrequency,
    });
  } catch (err) {
    if (err instanceof DomainValidationError) {
      throw new ValidationError(err.message, 'VALIDATION_ERROR', 'Portfolio validation failed');
    }
    throw err;
  }
  const dto = portfolio.toPersistenceDTO();

  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `UPDATE portfolios
          SET name = $2, assets = $3::jsonb, rebalance_frequency = $4, updated_at = NOW()
        WHERE id = $1
      RETURNING ${SELECT_COLS}`,
      [id, dto.name, JSON.stringify(dto.assets), input.rebalanceFrequency ?? 'none'],
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
