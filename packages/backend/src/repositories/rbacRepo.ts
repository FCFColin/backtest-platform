/**
 * RBAC 权限查询仓储（P2-01）：聚合用户跨角色权限集合。
 * 隔离：roles/role_permissions/user_roles 未启用 RLS（控制平面，org_id 显式过滤）。
 * 向后兼容：getUserPermissions 返回空集时中间件回退到 legacy ROLE_PERMISSIONS 映射。
 */
import { getPool } from '../db/pool.js';

/** 聚合用户跨角色权限集合（UNION 去重），空集时中间件回退 legacy 映射。 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const { rows } = await getPool().query(
    `SELECT DISTINCT rp.permission FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY rp.permission`,
    [userId],
  );
  return rows.map((r: { permission: string }) => r.permission);
}
