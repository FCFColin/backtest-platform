/**
 * 战术配置租户作用域仓储（P1-1 / ADR-032 / ADR-034）
 *
 * 企业理由：战术配置此前仅在内存中暂存，服务重启后丢失。持久化到 PostgreSQL 后由
 * RLS 强制租户隔离：读路径经 withTenantReadOnly()（读副本 + RLS），
 * 写路径经 withTenant()（主库 + RLS），在事务内激活 app.current_tenant_id。
 */
import { withTenant, withTenantReadOnly } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { rowMapper, iso } from './rowMapper.js';

export interface TacticalConfigRecord {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateTacticalConfigInput {
  name: string;
  description?: string;
  config: Record<string, unknown>;
}

interface UpdateTacticalConfigInput {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

const mapRow = rowMapper<TacticalConfigRecord>({
  id: 'id',
  name: 'name',
  description: 'description',
  config: 'config',
  userId: 'user_id',
  createdAt: (r) => iso(r.created_at),
  updatedAt: (r) => iso(r.updated_at),
});

const SELECT_COLS = 'id, name, description, config, user_id, created_at, updated_at';

/**
 * 列出租户下的全部战术配置（按更新时间倒序）。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @param limit - 返回上限（最大 200）
 * @param offset - 分页偏移
 * @returns 战术配置记录数组
 */
export async function findByTenant(
  tenantId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<TacticalConfigRecord[]> {
  return withTenantReadOnly(tenantId, async (client) => {
    const capped = Math.min(limit, 200);
    const offsetSafe = Math.max(0, offset);
    const { rows } = await client.query(
      `SELECT ${SELECT_COLS} FROM tactical_configs ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
      [capped, offsetSafe],
    );
    return rows.map(mapRow);
  });
}

/**
 * 按 ID 查找战术配置。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @param id - 配置 UUID
 * @returns 战术配置记录或 null
 */
export async function findById(tenantId: string, id: string): Promise<TacticalConfigRecord | null> {
  return withTenantReadOnly(tenantId, async (client) => {
    const { rows } = await client.query(
      `SELECT ${SELECT_COLS} FROM tactical_configs WHERE id = $1`,
      [id],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  });
}

/**
 * 创建战术配置。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @param userId - 创建者用户 UUID
 * @param input - 创建输入
 * @returns 新建的战术配置记录
 */
export async function create(
  tenantId: string,
  userId: string,
  input: CreateTacticalConfigInput,
): Promise<TacticalConfigRecord> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO tactical_configs (tenant_id, user_id, name, description, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SELECT_COLS}`,
      [tenantId, userId, input.name, input.description ?? null, input.config],
    );
    logger.info({ tenantId, userId, configId: rows[0].id }, '[tactical-config] Created');
    return mapRow(rows[0]);
  });
}

/**
 * 更新战术配置。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @param id - 配置 UUID
 * @param input - 更新输入（部分字段）
 * @returns 更新后的战术配置记录或 null（不存在时）
 */
export async function update(
  tenantId: string,
  id: string,
  input: UpdateTacticalConfigInput,
): Promise<TacticalConfigRecord | null> {
  return withTenant(tenantId, async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [id];
    let paramIdx = 2;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      params.push(input.name);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${paramIdx++}`);
      params.push(input.description);
    }
    if (input.config !== undefined) {
      sets.push(`config = $${paramIdx++}`);
      params.push(input.config);
    }

    if (sets.length === 0) {
      return findById(tenantId, id);
    }

    const { rows } = await client.query(
      `UPDATE tactical_configs SET ${sets.join(', ')} WHERE id = $1 RETURNING ${SELECT_COLS}`,
      params,
    );
    if (rows.length === 0) return null;
    logger.info({ tenantId, configId: id }, '[tactical-config] Updated');
    return mapRow(rows[0]);
  });
}

/**
 * 删除战术配置。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @param id - 配置 UUID
 * @returns 是否删除成功
 */
export async function remove(tenantId: string, id: string): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const result = await client.query('DELETE FROM tactical_configs WHERE id = $1', [id]);
    if ((result.rowCount ?? 0) > 0) {
      logger.info({ tenantId, configId: id }, '[tactical-config] Deleted');
    }
    return (result.rowCount ?? 0) > 0;
  });
}

/**
 * 统计租户的战术配置数量（用于配额检查）。
 *
 * @param tenantId - 活跃组织（租户）UUID
 * @returns 配置数量
 */
export async function count(tenantId: string): Promise<number> {
  return withTenantReadOnly(tenantId, async (client) => {
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM tactical_configs');
    return rows[0].count as number;
  });
}
