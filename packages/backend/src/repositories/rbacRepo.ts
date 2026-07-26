/**
 * 可配置 RBAC 仓储（P2-01）
 *
 * 企业理由：硬编码的 ROLE_PERMISSIONS 映射无法满足多租户差异化角色需求。
 * 本仓储将角色、角色-权限映射、用户-角色绑定持久化到数据库，使管理员可通过
 * Admin API 动态创建自定义角色、分配权限、绑定用户，无需发版。
 *
 * 隔离边界：roles/role_permissions/user_roles 属于身份/控制平面（与 memberships 同类），
 * 未启用 RLS——系统角色（org_id IS NULL）需全局可见，且中间件在"尚未解析出租户"时
 * 即需查询用户权限。租户自定义角色由应用层显式 WHERE org_id 过滤。
 *
 * 向后兼容：getUserPermissions 返回空集时，中间件回退到 legacy ROLE_PERMISSIONS 映射。
 */
import { getPool, withTenant, withTenantReadOnly } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/** 角色记录（API 友好结构） */
export interface RoleRecord {
  id: string;
  orgId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 用户角色绑定记录 */
export interface UserRoleRecord {
  userId: string;
  roleId: string;
  orgId: string | null;
  createdAt: string;
}

function mapRoleRow(row: {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): RoleRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapUserRoleRow(row: {
  user_id: string;
  role_id: string;
  org_id: string | null;
  created_at: Date | string;
}): UserRoleRecord {
  return {
    userId: row.user_id,
    roleId: row.role_id,
    orgId: row.org_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const ROLE_COLS = 'id, org_id, name, description, is_system, created_at, updated_at';

/**
 * 列出租户的全部角色（含系统角色）。
 *
 * 系统角色 org_id IS NULL 全局可见，租户自定义角色按 org_id 过滤。
 *
 * @param orgId - 活跃组织 UUID
 * @returns 角色记录数组（系统角色在前）
 */
export async function getRolesByOrg(orgId: string): Promise<RoleRecord[]> {
  return withTenantReadOnly(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT ${ROLE_COLS} FROM roles
        WHERE org_id = $1 OR org_id IS NULL
        ORDER BY is_system DESC, name ASC`,
      [orgId],
    );
    return rows.map(mapRoleRow);
  });
}

/**
 * 创建租户自定义角色（is_system=FALSE）。
 *
 * @param orgId - 活跃组织 UUID
 * @param name - 角色名（租户内唯一）
 * @param description - 角色描述
 * @returns 新建角色记录
 */
export async function createRole(
  orgId: string,
  name: string,
  description: string | null,
): Promise<RoleRecord> {
  return withTenant(orgId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO roles (org_id, name, description, is_system)
       VALUES ($1, $2, $3, FALSE)
       RETURNING ${ROLE_COLS}`,
      [orgId, name, description],
    );
    return mapRoleRow(rows[0]);
  });
}

/**
 * 更新角色（名称/描述）。系统角色禁止修改。
 *
 * @param roleId - 角色 UUID
 * @param name - 新角色名
 * @param description - 新描述
 * @returns 更新后的角色记录，或 'not_found' / 'system_role'
 */
export async function updateRole(
  roleId: string,
  name: string,
  description: string | null,
): Promise<RoleRecord | 'not_found' | 'system_role'> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT is_system FROM roles WHERE id = $1 FOR UPDATE`, [
      roleId,
    ]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    if (rows[0].is_system === true) {
      await client.query('ROLLBACK');
      return 'system_role';
    }
    const { rows: updated } = await client.query(
      `UPDATE roles SET name = $2, description = $3, updated_at = NOW()
        WHERE id = $1
       RETURNING ${ROLE_COLS}`,
      [roleId, name, description],
    );
    await client.query('COMMIT');
    return mapRoleRow(updated[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[rbacRepo] updateRole ROLLBACK 失败');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 删除角色。系统角色禁止删除。
 *
 * @param roleId - 角色 UUID
 * @returns true 删除成功，'not_found' 不存在，'system_role' 系统角色拒绝
 */
export async function deleteRole(roleId: string): Promise<boolean | 'not_found' | 'system_role'> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT is_system FROM roles WHERE id = $1 FOR UPDATE`, [
      roleId,
    ]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    if (rows[0].is_system === true) {
      await client.query('ROLLBACK');
      return 'system_role';
    }
    await client.query('DELETE FROM roles WHERE id = $1', [roleId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[rbacRepo] deleteRole ROLLBACK 失败');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 获取角色的权限列表。
 *
 * @param roleId - 角色 UUID
 * @returns 权限字符串数组
 */
export async function getRolePermissions(roleId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT permission FROM role_permissions WHERE role_id = $1 ORDER BY permission`,
    [roleId],
  );
  return rows.map((r: { permission: string }) => r.permission);
}

/**
 * 替换角色的全部权限（先删后插，事务保证原子性）。
 *
 * @param roleId - 角色 UUID
 * @param permissions - 权限字符串数组
 * @returns 'ok' 成功，'not_found' 角色不存在
 */
export async function setRolePermissions(
  roleId: string,
  permissions: string[],
): Promise<'ok' | 'not_found'> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id FROM roles WHERE id = $1', [roleId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    if (permissions.length > 0) {
      // 批量插入：unnest 展开数组，单次往返
      await client.query(
        `INSERT INTO role_permissions (role_id, permission)
         SELECT $1, perm FROM unnest($2::text[]) AS perm`,
        [roleId, permissions],
      );
    }
    await client.query('COMMIT');
    return 'ok';
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[rbacRepo] setRolePermissions ROLLBACK 失败');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 获取用户绑定的角色 ID 列表。
 *
 * @param userId - 用户 UUID
 * @returns 用户角色绑定记录数组
 */
export async function getUserRoles(userId: string): Promise<UserRoleRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_id, role_id, org_id, created_at FROM user_roles
      WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(mapUserRoleRow);
}

/**
 * 为用户分配角色（已存在则幂等返回）。
 *
 * @param userId - 用户 UUID
 * @param roleId - 角色 UUID
 * @param orgId - 组织 UUID（记录角色绑定的组织归属）
 */
export async function assignUserRole(
  userId: string,
  roleId: string,
  orgId: string | null,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, org_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId, orgId],
  );
}

/**
 * 移除用户的角色绑定。
 *
 * @param userId - 用户 UUID
 * @param roleId - 角色 UUID
 * @returns 是否移除成功
 */
export async function removeUserRole(userId: string, roleId: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
    [userId, roleId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * 聚合用户跨全部角色的权限集合（UNION 去重）。
 *
 * 企业理由：中间件在每个需鉴权请求上调用此函数，聚合用户所有绑定角色的权限，
 * 用于判断是否放行。返回空集时由中间件回退到 legacy ROLE_PERMISSIONS 映射。
 *
 * @param userId - 用户 UUID
 * @returns 权限字符串数组（去重）
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT rp.permission
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY rp.permission`,
    [userId],
  );
  return rows.map((r: { permission: string }) => r.permission);
}

/**
 * 查询绑定了指定角色的全部用户 ID（角色权限变更时用于缓存失效）。
 *
 * @param roleId - 角色 UUID
 * @returns 用户 UUID 数组
 */
export async function getUserIdsByRole(roleId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT user_id FROM user_roles WHERE role_id = $1`, [roleId]);
  return rows.map((r: { user_id: string }) => r.user_id);
}
