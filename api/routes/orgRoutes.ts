/**
 * 组织与成员管理路由（ADR-035）
 *
 * 挂载于 /api/v1/orgs，app.ts 前置链：jwtAuth → resolveTenant。本路由内部对除
 * "接受邀请"外的端点追加 requireTenant。读操作（组织信息、成员/邀请列表）任意成员可见；
 * 写操作（改名、改成员角色、移除成员、邀请增删）要求 ADMIN_ACCESS（owner/admin）。
 * 接受邀请 POST /invitations/accept 仅需登录（受邀者尚不属于该组织，不能要求 requireTenant）。
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import {
  getOrg,
  updateOrgName,
  listOrgMembers,
  updateMemberRole,
  removeMember,
} from '../services/membershipService.js';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  acceptInvitation,
} from '../services/invitationService.js';
import { sendInvitationEmail } from '../services/mailService.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_ENUM = z.enum(['owner', 'admin', 'analyst', 'readonly']);

const requireAdmin = requirePermission(Permission.ADMIN_ACCESS);

// ---------------------------------------------------------------------------
// 接受邀请：仅需登录（不要求活跃租户，因受邀者尚未加入）。在 tenant 中间件之前注册。
// ---------------------------------------------------------------------------
const acceptSchema = z.object({ token: z.string().min(1).max(256) });
router.post(
  '/invitations/accept',
  validate(acceptSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: '未认证' });
      return;
    }
    const { token } = req.body as { token: string };
    const result = await acceptInvitation(token, req.user.sub);
    if (!result.ok) {
      const map = { invalid: '邀请无效', expired: '邀请已过期', already: '邀请已被接受' } as const;
      sendProblem(res, 400, `INVITATION_${result.reason.toUpperCase()}`, 'Bad Request', {
        detail: map[result.reason],
      });
      return;
    }
    res.json({ success: true, data: { orgId: result.orgId, role: result.role } });
  },
);

// 以下端点均需活跃租户上下文（jwtAuth/resolveTenant 已由 app.ts 前置）
router.use(requireTenant);

/** GET /api/v1/orgs/current - 当前组织信息（任意成员可见） */
router.get('/current', async (req: AuthenticatedRequest, res: Response) => {
  const org = await getOrg(req.tenantId as string);
  if (!org) {
    sendProblem(res, 404, 'ORG_NOT_FOUND', 'Not Found', { detail: '组织不存在' });
    return;
  }
  res.json({ success: true, data: org });
});

/** PATCH /api/v1/orgs/current - 更新组织名称（admin） */
const updateOrgSchema = z.object({ name: z.string().trim().min(1).max(120) });
router.patch(
  '/current',
  requireAdmin,
  validate(updateOrgSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const ok = await updateOrgName(req.tenantId as string, (req.body as { name: string }).name);
    if (!ok) {
      sendProblem(res, 404, 'ORG_NOT_FOUND', 'Not Found', { detail: '组织不存在' });
      return;
    }
    res.json({ success: true, data: { updated: true } });
  },
);

/** GET /api/v1/orgs/members - 成员列表（任意成员可见） */
router.get('/members', async (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: await listOrgMembers(req.tenantId as string) });
});

/** PATCH /api/v1/orgs/members/:userId - 修改成员角色（admin） */
const roleSchema = z.object({ role: ROLE_ENUM });
router.patch(
  '/members/:userId',
  requireAdmin,
  validate(roleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!UUID_RE.test(req.params.userId)) {
      sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'userId 必须为 UUID' });
      return;
    }
    const result = await updateMemberRole(
      req.tenantId as string,
      req.params.userId,
      (req.body as { role: 'owner' | 'admin' | 'analyst' | 'readonly' }).role,
    );
    if (result === 'not_found') {
      sendProblem(res, 404, 'MEMBER_NOT_FOUND', 'Not Found', { detail: '成员不存在' });
      return;
    }
    if (result === 'last_owner') {
      sendProblem(res, 409, 'LAST_OWNER', 'Conflict', { detail: '不能降级组织唯一的 owner' });
      return;
    }
    res.json({ success: true, data: { updated: true } });
  },
);

/** DELETE /api/v1/orgs/members/:userId - 移除成员（admin） */
router.delete(
  '/members/:userId',
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!UUID_RE.test(req.params.userId)) {
      sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'userId 必须为 UUID' });
      return;
    }
    const result = await removeMember(req.tenantId as string, req.params.userId);
    if (result === 'not_found') {
      sendProblem(res, 404, 'MEMBER_NOT_FOUND', 'Not Found', { detail: '成员不存在' });
      return;
    }
    if (result === 'last_owner') {
      sendProblem(res, 409, 'LAST_OWNER', 'Conflict', { detail: '不能移除组织唯一的 owner' });
      return;
    }
    res.json({ success: true, data: { removed: true } });
  },
);

/** GET /api/v1/orgs/invitations - 邀请列表（admin） */
router.get('/invitations', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: await listInvitations(req.tenantId as string) });
});

/** POST /api/v1/orgs/invitations - 创建邀请并发送邮件（admin） */
const inviteSchema = z.object({
  email: z.string().email(),
  role: ROLE_ENUM.exclude(['owner']).default('analyst'),
});
router.post(
  '/invitations',
  requireAdmin,
  validate(inviteSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.tenantId as string;
    const { email, role } = req.body as { email: string; role: 'admin' | 'analyst' | 'readonly' };
    try {
      const inv = await createInvitation(orgId, email, role, req.user?.sub ?? null);
      const org = await getOrg(orgId);
      try {
        await sendInvitationEmail(email, org?.name ?? '组织', inv.token);
      } catch (err) {
        logger.warn({ err: String(err), orgId, email }, '[orgRoutes] 邀请邮件发送失败');
      }
      res
        .status(201)
        .json({
          success: true,
          data: { id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt },
        });
    } catch (err) {
      logger.error({ err: String(err), orgId }, '[orgRoutes] 创建邀请失败');
      sendProblem(res, 500, 'INVITE_CREATE_FAILED', 'Internal Server Error', {
        detail: '创建邀请失败',
      });
    }
  },
);

/** DELETE /api/v1/orgs/invitations/:id - 撤销邀请（admin） */
router.delete(
  '/invitations/:id',
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) {
      sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'id 必须为 UUID' });
      return;
    }
    const ok = await revokeInvitation(req.tenantId as string, req.params.id);
    if (!ok) {
      sendProblem(res, 404, 'INVITATION_NOT_FOUND', 'Not Found', {
        detail: '邀请不存在或已被接受',
      });
      return;
    }
    res.json({ success: true, data: { revoked: true } });
  },
);

export default router;
