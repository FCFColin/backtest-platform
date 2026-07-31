/**
 * 可配置 RBAC 仓储（P2-01）：角色/权限/绑定持久化，支持多租户自定义角色。
 * 隔离：roles/role_permissions/user_roles 未启用 RLS（控制平面，org_id 显式过滤）。
 * 向后兼容：getUserPermissions 返回空集时回退到 legacy ROLE_PERMISSIONS 映射。
 */
import { getPool, withTenant, withTenantReadOnly } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export interface RoleRecord {
  id: string;
  orgId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleRecord {
  userId: string;
  roleId: string;
  orgId: string | null;
  createdAt: string;
}

function mapRoleRow(row: {
  id: string; org_id: string | null; name: string; description: string | null;
  is_system: boolean; created_at: Date | string; updated_at: Date | string;
}): RoleRecord {
  return {
    id: row.id, orgId: row.org_id, name: row.name, description: row.description,
    isSystem: row.is_system,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapUserRoleRow(row: {
  user_id: string; role_id: string; org_id: string | null; created_at: Date | string;
}): UserRoleRecord {
  return {
    userId: row.user_id, roleId: row.role_id, orgId: row.org_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const ROLE_COLS = 'id, org_id, name, description, is_system, created_at, updated_at';

/** 列出租户全部角色（含系统角色，系统角色在前）。 */
export async function getRolesByOrg(orgId: string): Promise<RoleRecord[]> {
  return withTenantReadOnly(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT ${ROLE_COLS} FROM roles WHERE org_id = $1 OR org_id IS NULL ORDER BY is_system DESC, name ASC`,
      [orgId],
    );
    return rows.map(mapRoleRow);
  });
}

/** 创建租户自定义角色（is_system=FALSE）。 */
export async function createRole(orgId: string, name: string, description: string | null): Promise<RoleRecord> {
  return withTenant(orgId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO roles (org_id, name, description, is_system) VALUES ($1, $2, $3, FALSE) RETURNING ${ROLE_COLS}`,
      [orgId, name, description],
    );
    return mapRoleRow(rows[0]);
  });
}

/** 更新角色（名称/描述）。系统角色禁止修改。返回 'not_found' / 'system_role' / 记录。 */
export async function updateRole(
  roleId: string, name: string, description: string | null,
): Promise<RoleRecord | 'not_found' | 'system_role'> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT is_system FROM roles WHERE id = $1 FOR UPDATE', [roleId]);
    if (rows.length === 0) { await client.query('ROLLBACK'); return 'not_found'; }
    if (rows[0].is_system === true) { await client.query('ROLLBACK'); return 'system_role'; }
    const { rows: updated } = await client.query(
      `UPDATE roles SET name = $2, description = $3, updated_at = NOW() WHERE id = $1 RETURNING ${ROLE_COLS}`,
      [roleId, name, description],
    );
    await client.query('COMMIT');
    return mapRoleRow(updated[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { logger.error({ err: e }, '[rbacRepo] updateRole ROLLBACK 失败'); }
    throw err;
  } finally {
    client.release();
  }
}

/** 删除角色。系统角色禁止删除。返回 true / 'not_found' / 'system_role'。 */
export async function deleteRole(roleId: string): Promise<boolean | 'not_found' | 'system_role'> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT is_system FROM roles WHERE id = $1 FOR UPDATE', [roleId]);
    if (rows.length === 0) { await client.query('ROLLBACK'); return 'not_found'; }
    if (rows[0].is_system === true) { await client.query('ROLLBACK'); return 'system_role'; }
    await client.query('DELETE FROM roles WHERE id = $1', [roleId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { logger.error({ err: e }, '[rbacRepo] deleteRole ROLLBACK 失败'); }
    throw err;
  } finally {
    client.release();
  }
}

/** 获取角色权限列表。 */
export async function getRolePermissions(roleId: string): Promise<string[]> {
  const { rows } = await getPool().query(
    'SELECT permission FROM role_permissions WHERE role_id = $1 ORDER BY permission', [roleId],
  );
  return rows.map((r: { permission: string }) => r.permission);
}

/** 替换角色全部权限（先删后插，事务原子）。返回 'ok' / 'not_found'。 */
export async function setRolePermissions(roleId: string, permissions: string[]): Promise<'ok' | 'not_found'> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id FROM roles WHERE id = $1', [roleId]);
    if (rows.length === 0) { await client.query('ROLLBACK'); return 'not_found'; }
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    if (permissions.length > 0) {
      // 批量插入：unnest 展开数组，单次往返
      await client.query(
        `INSERT INTO role_permissions (role_id, permission) SELECT $1, perm FROM unnest($2::text[]) AS perm`,
        [roleId, permissions],
      );
    }
    await client.query('COMMIT');
    return 'ok';
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { logger.error({ err: e }, '[rbacRepo] setRolePermissions ROLLBACK 失败'); }
    throw err;
  } finally {
    client.release();
  }
}

/** 获取用户绑定的角色列表。 */
export async function getUserRoles(userId: string): Promise<UserRoleRecord[]> {
  const { rows } = await getPool().query(
    `SELECT user_id, role_id, org_id, created_at FROM user_roles WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(mapUserRoleRow);
}

/** 为用户分配角色（幂等）。 */
export async function assignUserRole(userId: string, roleId: string, orgId: string | null): Promise<void> {
  await getPool().query(
    `INSERT INTO user_roles (user_id, role_id, org_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId, orgId],
  );
}

/** 移除用户角色绑定。 */
export async function removeUserRole(userId: string, roleId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [userId, roleId],
  );
  return (rowCount ?? 0) > 0;
}

/** 聚合用户跨角色权限集合（UNION 去重），空集时中间件回退 legacy 映射。 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const { rows } = await getPool().query(
    `SELECT DISTINCT rp.permission FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY rp.permission`,
    [userId],
  );
  return rows.map((r: { permission: string }) => r.permission);
}

/** 查询绑定指定角色的用户 ID（角色权限变更时缓存失效用）。 */
export async function getUserIdsByRole(roleId: string): Promise<string[]> {
  const { rows } = await getPool().query('SELECT user_id FROM user_roles WHERE role_id = $1', [roleId]);
  return rows.map((r: { user_id: string }) => r.user_id);
}
