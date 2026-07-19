/**
 * 组织邀请仓储（ADR-035）
 *
 * 企业理由：团队协作需要把新成员按指定角色加入组织。邀请以邮箱为目标、持哈希令牌，
 * 受邀者注册/登录后凭明文令牌接受邀请即建立 membership。令牌仅存哈希、有过期、可吊销。
 *
 * 隔离边界：invitations 属身份/控制平面，不启用 RLS（accept 流程跨"受邀者尚不属于组织"
 * 的边界）。按 org_id 的读写在应用层显式收敛；accept 凭高熵令牌完成。
 *
 * 本仓储只承载 CRUD（创建、列表、撤销）；accept 业务流程见 services/invitationService.ts。
 */
import crypto from 'crypto';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { sha256Hex } from '../utils/crypto.js';
import type { OrgRole } from '../middleware/authTypes.js';

/** 邀请有效期（毫秒，7 天） */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 邀请记录（不含令牌哈希，可安全返回） */
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

/** 创建结果，含一次性明文令牌（用于邮件链接） */
interface CreatedInvitation extends InvitationRecord {
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
