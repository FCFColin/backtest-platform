/**
 * 组织邀请业务流程服务（精简版，ADR-035）
 *
 * 仅承载 accept 流程（凭明文令牌在事务内 upsert membership + 标记已接受）。
 * CRUD（创建、列表、撤销）见 repositories/invitationRepo.ts。
 *
 * 隔离边界：accept 凭高熵令牌完成，跨"受邀者尚不属于组织"的边界，不启用 RLS。
 */
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { sha256Hex, type OrgRole } from '../repositories/invitationRepo.js';

export {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../repositories/invitationRepo.js';

/** 接受邀请的结果 */
type AcceptResult =
  | { ok: true; orgId: string; role: OrgRole }
  | { ok: false; reason: 'invalid' | 'expired' | 'already' };

/**
 * 接受邀请：校验明文令牌，未过期未接受时为当前用户在组织内建立成员关系。
 *
 * @param token - 明文邀请令牌
 * @param userId - 接受邀请的用户 UUID
 * @returns 接受结果
 */
export async function acceptInvitation(token: string, userId: string): Promise<AcceptResult> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) {
    return { ok: false, reason: 'invalid' };
  }
  const tokenHash = sha256Hex(token);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, org_id, role, expires_at, accepted_at FROM invitations WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'invalid' };
    }
    const inv = rows[0];
    if (inv.accepted_at) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'already' };
    }
    if (new Date(inv.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'expired' };
    }
    // upsert membership：已是成员则不降级，保留较高角色由管理员另行调整
    await client.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      [inv.org_id, userId, inv.role],
    );
    await client.query('UPDATE invitations SET accepted_at = NOW() WHERE id = $1', [inv.id]);
    await client.query('COMMIT');
    logger.info({ orgId: inv.org_id, userId, role: inv.role }, '[invitationService] 邀请已接受');
    return { ok: true, orgId: inv.org_id, role: inv.role };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: String(err) }, '[invitationService] 接受邀请失败');
    return { ok: false, reason: 'invalid' };
  } finally {
    client.release();
  }
}
