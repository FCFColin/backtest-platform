/**
 * 组织邀请服务（ADR-035）
 *
 * 企业理由：团队协作需要把新成员按指定角色加入组织。邀请以邮箱为目标、持哈希令牌，
 * 受邀者注册/登录后凭明文令牌接受邀请即建立 membership。令牌仅存哈希、有过期、可吊销。
 *
 * 隔离边界：invitations 属身份/控制平面，不启用 RLS（accept 流程跨"受邀者尚不属于组织"
 * 的边界）。按 org_id 的读写在应用层显式收敛；accept 凭高熵令牌完成。
 */
import crypto from 'crypto';
import { getPool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { OrgRole } from './membershipService.js';

/** 邀请有效期（毫秒，7 天） */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

/** 邀请记录（不含令牌哈希，可安全返回） */
export interface InvitationRecord {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** 创建结果，含一次性明文令牌（用于邮件链接） */
export interface CreatedInvitation extends InvitationRecord {
  token: string;
}

function mapRow(row: {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  invited_by: string | null;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  created_at: Date | string;
}): InvitationRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    expiresAt: new Date(row.expires_at).toISOString(),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * 创建组织邀请（同组织同邮箱若已有待处理邀请，先撤销旧的再建新）。
 *
 * @param orgId - 组织 UUID
 * @param email - 受邀邮箱
 * @param role - 加入后的角色
 * @param invitedBy - 邀请人用户 UUID（可空）
 * @returns 含明文令牌的邀请记录
 */
export async function createInvitation(
  orgId: string,
  email: string,
  role: OrgRole,
  invitedBy: string | null,
): Promise<CreatedInvitation> {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const pool = getPool();
  // 清理同组织同邮箱的历史待处理邀请，规避唯一索引冲突
  await pool.query(
    `DELETE FROM invitations WHERE org_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL`,
    [orgId, email],
  );
  const { rows } = await pool.query(
    `INSERT INTO invitations (org_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, org_id, email, role, invited_by, expires_at, accepted_at, created_at`,
    [orgId, email, role, tokenHash, invitedBy, expiresAt],
  );
  logger.info({ orgId, email, role }, '[invitationService] 已创建邀请');
  return { ...mapRow(rows[0]), token };
}

/**
 * 列出组织的邀请（含已接受/待处理）。
 *
 * @param orgId - 组织 UUID
 */
export async function listInvitations(orgId: string): Promise<InvitationRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, org_id, email, role, invited_by, expires_at, accepted_at, created_at
       FROM invitations WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );
  return rows.map(mapRow);
}

/**
 * 撤销邀请（仅限本组织、未接受的邀请）。
 *
 * @param orgId - 组织 UUID
 * @param id - 邀请 UUID
 * @returns 是否撤销成功
 */
export async function revokeInvitation(orgId: string, id: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM invitations WHERE id = $1 AND org_id = $2 AND accepted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}

/** 接受邀请的结果 */
export type AcceptResult =
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
