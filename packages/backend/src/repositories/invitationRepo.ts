// ADR-035: 令牌仅存哈希、有过期、可吊销；创建走 withTenant（invitations 的 WITH CHECK 无逃逸），列表/撤销靠 USING 逃逸放行
import crypto from 'crypto';
import { getPool, withTenant } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { sha256Hex } from '../utils/crypto.js';
import type { OrgRole } from '../middleware/jwtAuth.js';
import { rowMapper, iso, toIso } from './rowMapper.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface InvitationRecord {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface CreatedInvitation extends InvitationRecord {
  token: string;
}

const mapRow = rowMapper<InvitationRecord>({
  id: 'id',
  orgId: 'org_id',
  email: 'email',
  role: 'role',
  invitedBy: 'invited_by',
  expiresAt: (r) => iso(r.expires_at),
  acceptedAt: (r) => toIso(r.accepted_at),
  createdAt: (r) => iso(r.created_at),
});

export async function createInvitation(
  orgId: string,
  email: string,
  role: OrgRole,
  invitedBy: string | null,
): Promise<CreatedInvitation> {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const { rows } = await withTenant(orgId, async (client) => {
    await client.query(
      `DELETE FROM invitations WHERE org_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL`,
      [orgId, email],
    );
    return client.query(
      `INSERT INTO invitations (org_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, org_id, email, role, invited_by, expires_at, accepted_at, created_at`,
      [orgId, email, role, tokenHash, invitedBy, expiresAt],
    );
  });
  logger.info({ orgId, email, role }, '[invitationService] 已创建邀请');
  return { ...mapRow(rows[0]), token };
}

export async function listInvitations(orgId: string): Promise<InvitationRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, org_id, email, role, invited_by, expires_at, accepted_at, created_at
       FROM invitations WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );
  return rows.map(mapRow);
}

export async function revokeInvitation(orgId: string, id: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM invitations WHERE id = $1 AND org_id = $2 AND accepted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}
