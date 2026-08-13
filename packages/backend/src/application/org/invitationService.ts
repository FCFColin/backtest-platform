// ADR-009: accept 凭高熵令牌跨组织边界读取，随后注入租户上下文（RLS WITH CHECK 需 org_id 匹配）
import { withTransaction } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import type { OrgRole } from '@backtest/shared/types/org';
import { sha256Hex } from '../../utils/crypto.js';

export {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../../repositories/invitationRepo.js';

type AcceptResult =
  | { ok: true; orgId: string; role: OrgRole }
  | { ok: false; reason: 'invalid' | 'expired' | 'already' };

export async function acceptInvitation(token: string, userId: string): Promise<AcceptResult> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) {
    return { ok: false, reason: 'invalid' };
  }
  const tokenHash = sha256Hex(token);
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, org_id, role, expires_at, accepted_at FROM invitations WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash],
      );
      if (rows.length === 0) return { ok: false, reason: 'invalid' };
      const inv = rows[0];
      if (inv.accepted_at) return { ok: false, reason: 'already' };
      if (new Date(inv.expires_at).getTime() <= Date.now()) {
        return { ok: false, reason: 'expired' };
      }
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [inv.org_id]);
      await client.query(
        `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [inv.org_id, userId, inv.role],
      );
      await client.query('UPDATE invitations SET accepted_at = NOW() WHERE id = $1', [inv.id]);
      logger.info({ orgId: inv.org_id, userId, role: inv.role }, '[invitationService] 邀请已接受');
      return { ok: true, orgId: inv.org_id, role: inv.role };
    });
  } catch (err) {
    logger.error({ err: String(err) }, '[invitationService] 接受邀请失败');
    return { ok: false, reason: 'invalid' };
  }
}
