/**
 * 命名配置（saved_configs）租户作用域仓储（ADR-034）
 *
 * 企业理由：回测页"保存/加载命名配置"此前依赖浏览器 localStorage，无法跨设备/团队共享。
 * 迁移到 Postgres + RLS 后，配置成为租户级资产，由 withTenant() 强制隔离。
 * config 以 JSONB 原样存储完整回测请求（组合 + 参数），加载时直接回填前端。
 */
import { withTenant } from '../db/index.js';

/** 命名配置记录 */
export interface SavedConfigRecord {
  id: string;
  name: string;
  config: unknown;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新输入 */
export interface SavedConfigInput {
  name: string;
  config: unknown;
}

function mapRow(row: {
  id: string;
  name: string;
  config: unknown;
  owner_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): SavedConfigRecord {
  return {
    id: row.id,
    name: row.name,
    config: row.config,
    ownerUserId: row.owner_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SELECT_COLS = 'id, name, config, owner_user_id, created_at, updated_at';

/**
 * 列出租户下全部命名配置（按更新时间倒序）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param limit - 返回条数上限（默认 100，最大 1000）
 * @param offset - 偏移量（默认 0）
 */
export async function listConfigs(
  tenantId: string,
  limit = 100,
  offset = 0,
): Promise<{ rows: SavedConfigRecord[]; total: number }> {
  return withTenant(tenantId, async (client) => {
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 1000);
    const safeOffset = Math.max(0, Math.trunc(offset));
    const [{ rows }, { rows: countRows }] = await Promise.all([
      client.query(
        `SELECT ${SELECT_COLS} FROM saved_configs ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
        [safeLimit, safeOffset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM saved_configs`, []),
    ]);
    return { rows: rows.map(mapRow), total: countRows[0].total };
  });
}

/**
 * 按 ID 获取命名配置（不存在返回 null）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 配置 UUID
 */
export async function getConfig(tenantId: string, id: string): Promise<SavedConfigRecord | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(`SELECT ${SELECT_COLS} FROM saved_configs WHERE id = $1`, [
      id,
    ]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  });
}

/**
 * 创建命名配置。若同名已存在则覆盖其内容（upsert 语义，贴合"保存为同名"的前端习惯）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param ownerUserId - 创建者 UUID（可空）
 * @param input - 配置内容
 */
export async function createConfig(
  tenantId: string,
  ownerUserId: string | null,
  input: SavedConfigInput,
): Promise<SavedConfigRecord> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO saved_configs (tenant_id, owner_user_id, name, config)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING ${SELECT_COLS}`,
      [tenantId, ownerUserId, input.name, JSON.stringify(input.config)],
    );
    return mapRow(rows[0]);
  });
}

/**
 * 更新命名配置（全量覆盖）。不存在返回 null。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 配置 UUID
 * @param input - 新内容
 */
export async function updateConfig(
  tenantId: string,
  id: string,
  input: SavedConfigInput,
): Promise<SavedConfigRecord | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `UPDATE saved_configs
          SET name = $2, config = $3::jsonb, updated_at = NOW()
        WHERE id = $1
      RETURNING ${SELECT_COLS}`,
      [id, input.name, JSON.stringify(input.config)],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  });
}

/**
 * 删除命名配置。返回是否删除成功。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 配置 UUID
 */
export async function deleteConfig(tenantId: string, id: string): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query('DELETE FROM saved_configs WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  });
}
