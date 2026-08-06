import { getPool } from '../db/pool.js';

export async function getUserPermissions(userId: string): Promise<string[]> {
  const { rows } = await getPool().query(
    `SELECT DISTINCT rp.permission FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY rp.permission`,
    [userId],
  );
  return rows.map((r: { permission: string }) => r.permission);
}
