/**
 * 认证路由 — 注册与邮箱验证（ADR-035）
 *
 * 从 authRoutes.ts 拆分而来，降低单文件复杂度。
 * 包含：自助注册、邮箱验证令牌校验、重发验证邮件。
 */

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { jwtAuth, type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hashUserId, requireUser } from '../middleware/authTypes.js';
import { validate } from '../middleware/validate.js';
import { registerSchema } from '../schemas/auth.js';
import { createUserTx, getUserByEmail } from '../repositories/userRepo.js';
import { issueEmailVerificationToken, verifyEmailToken } from '../application/auth/userService.js';
import { getClient } from '../db/pool.js';
import { sendVerificationEmail } from '../infrastructure/mailService.js';

const router = Router();

/** 由名称生成 URL 友好且唯一的 org slug（追加随机后缀避免碰撞）。 */
function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

/**
 * POST /api/v1/auth/register - 自助注册（ADR-035）
 *
 * 请求体：{ username, password, email, orgName }
 * 在单事务内创建：用户 + 组织 + owner 成员关系；随后签发邮箱验证令牌并发送验证邮件。
 *
 * 企业理由：SaaS 自助开通的核心入口。三者一并落库保证不出现"有用户无组织"的孤儿态；
 * 邮箱验证（异步、不阻塞注册成功）用于防滥用与找回。返回不含令牌——引导用户登录/验证。
 */
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  const { username, password, email, orgName } = req.body;

  // 预检邮箱占用（最终唯一性仍由 DB 唯一索引兜底）
  const existing = await getUserByEmail(email);
  if (existing) {
    sendProblem(res, 409, 'EMAIL_TAKEN', 'Conflict', { detail: '该邮箱已被注册' });
    return;
  }

  const client = await getClient();
  let userId = '';
  try {
    await client.query('BEGIN');
    const user = await createUserTx(client, username, password, email, 'admin');
    userId = user.id;
    const slug = slugify(orgName);
    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
      [orgName, slug],
    );
    const orgId = orgRes.rows[0].id as string;
    await client.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      orgId,
      userId,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = String(err);
    // 唯一约束冲突（用户名/邮箱/slug）
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      sendProblem(res, 409, 'ACCOUNT_CONFLICT', 'Conflict', { detail: '用户名或邮箱已被占用' });
      return;
    }
    logger.error({ err: msg }, '[auth] 注册失败');
    sendProblem(res, 500, 'REGISTER_FAILED', 'Internal Server Error', { detail: '注册失败' });
    return;
  } finally {
    client.release();
  }

  // 事务外发送验证邮件（失败不影响注册成功，用户可重发）
  try {
    const token = await issueEmailVerificationToken(userId);
    await sendVerificationEmail(email, token);
  } catch (err) {
    logger.warn({ err: String(err), userId }, '[auth] 验证邮件发送失败（可稍后重发）');
  }

  logger.info({ userId }, '[auth] 注册成功');
  res.status(201).json({
    success: true,
    data: { userId, message: '注册成功，请查收验证邮件以完成邮箱验证' },
  });
});

/**
 * POST /api/v1/auth/verify-email - 校验邮箱验证令牌（ADR-035）
 *
 * 请求体：{ token }
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    sendProblem(res, 422, 'MISSING_TOKEN', 'Missing token', { detail: '缺少 token' });
    return;
  }
  const userId = await verifyEmailToken(token);
  if (!userId) {
    sendProblem(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Bad Request', {
      detail: '验证链接无效或已过期',
    });
    return;
  }
  res.json({ success: true, data: { userId, verified: true } });
});

/**
 * POST /api/v1/auth/resend-verification - 重发验证邮件（需登录，ADR-035）
 */
router.post('/resend-verification', jwtAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;
  const { email } = req.body as { email?: string };
  if (!email) {
    sendProblem(res, 422, 'MISSING_EMAIL', 'Missing email', { detail: '缺少 email' });
    return;
  }
  try {
    const token = await issueEmailVerificationToken(req.user.sub);
    await sendVerificationEmail(email, token);
  } catch (err) {
    logger.warn({ err: String(err), userId: hashUserId(req.user.sub) }, '[auth] 重发验证邮件失败');
  }
  // 不泄露邮箱是否存在/有效，统一返回成功
  res.json({ success: true, data: { message: '若邮箱有效，验证邮件已发送' } });
});

export default router;
