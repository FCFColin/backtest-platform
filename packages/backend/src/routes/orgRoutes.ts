import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { tenantHandler, requireUuidParam, sendData, crudRouteHandler } from './routeUtils.js';
import {
  getOrg,
  listOrgMembers,
  updateMemberRole,
  removeMember,
} from '../application/org/membershipService.js';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  acceptInvitation,
} from '../application/org/invitationService.js';
import { sendInvitationEmail } from '../infrastructure/mailService.js';
import { revokeAllUserSessions } from '../middleware/tokenStore.js';
import { ORG_ROLES } from '@backtest/shared/types';

const router = Router();

const ROLE_ENUM = z.enum(ORG_ROLES);

const requireAdmin = requirePermission(Permission.ADMIN_ACCESS);

const acceptSchema = z.object({ token: z.string().min(1).max(256) });
router.post(
  '/invitations/accept',
  validate(acceptSchema),
  crudRouteHandler(
    async (req, res) => {
      if (!req.user) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }
      const { token } = req.body as { token: string };
      const result = await acceptInvitation(token, req.user.sub);
      if (!result.ok) {
        sendProblem(res, 400, `INVITATION_${result.reason.toUpperCase()}`);
        return;
      }
      sendData(res, { orgId: result.orgId, role: result.role });
    },
    { logMsg: '[orgRoutes] 接受邀请失败', code: 'INVITATION_ACCEPT_FAILED' },
  ),
);

router.use(requireTenant);

router.get(
  '/members',
  tenantHandler(
    '[orgRoutes] 获取成员列表失败',
    'ORG_MEMBERS_LIST_FAILED',
    async (_req, res, tenantId) => {
      sendData(res, await listOrgMembers(tenantId));
    },
  ),
);

const roleSchema = z.object({ role: ROLE_ENUM });
const sendMemberOutcome = (
  res: Response,
  result: 'ok' | 'not_found' | 'last_owner',
  okPayload: object,
) => {
  if (result === 'not_found') {
    sendProblem(res, 404, 'MEMBER_NOT_FOUND');
    return;
  }
  if (result === 'last_owner') {
    sendProblem(res, 409, 'LAST_OWNER');
    return;
  }
  sendData(res, okPayload);
};

router.patch(
  '/members/:userId',
  requireAdmin,
  validate(roleSchema),
  tenantHandler(
    '[orgRoutes] 更新成员角色失败',
    'ORG_MEMBER_ROLE_UPDATE_FAILED',
    async (req, res, tenantId) => {
      if (!requireUuidParam(res, req.params.userId)) return;
      // 越权防护：仅租户 owner（或平台管理员）可授予 owner 角色，admin 提升自己/他人为 owner 即夺权
      const targetRole = (req.body as { role: 'owner' | 'admin' | 'analyst' | 'readonly' }).role;
      if (targetRole === 'owner' && req.user?.org_role !== 'owner' && !req.user?.platform_admin) {
        sendProblem(res, 403, 'OWNER_ONLY_OPERATION');
        return;
      }
      // P1#1（安全审计）：角色变更后吊销目标用户全部会话，防止旧角色/旧凭证残留
      const outcome = await updateMemberRole(tenantId, req.params.userId, targetRole);
      if (outcome === 'ok') await revokeAllUserSessions(req.params.userId);
      sendMemberOutcome(res, outcome, { updated: true });
    },
  ),
);

router.delete(
  '/members/:userId',
  requireAdmin,
  tenantHandler(
    '[orgRoutes] 移除成员失败',
    'ORG_MEMBER_REMOVE_FAILED',
    async (req, res, tenantId) => {
      if (!requireUuidParam(res, req.params.userId)) return;
      // P1#1（安全审计）：移除成员后吊销其全部会话，防止旧 token 持续访问
      const outcome = await removeMember(tenantId, req.params.userId);
      if (outcome === 'ok') await revokeAllUserSessions(req.params.userId);
      sendMemberOutcome(res, outcome, { removed: true });
    },
  ),
);

router.get(
  '/invitations',
  requireAdmin,
  tenantHandler(
    '[orgRoutes] 获取邀请列表失败',
    'ORG_INVITATIONS_LIST_FAILED',
    async (_req, res, tenantId) => {
      sendData(res, await listInvitations(tenantId));
    },
  ),
);

const inviteSchema = z.object({
  email: z.string().email(),
  role: ROLE_ENUM.exclude(['owner']).default('analyst'),
});
router.post(
  '/invitations',
  requireAdmin,
  validate(inviteSchema),
  tenantHandler('[orgRoutes] 创建邀请失败', 'INVITE_CREATE_FAILED', async (req, res, orgId) => {
    const { email, role } = req.body as { email: string; role: 'admin' | 'analyst' | 'readonly' };
    const inv = await createInvitation(orgId, email, role, req.user?.sub ?? null);
    const org = await getOrg(orgId);
    try {
      await sendInvitationEmail(email, org?.name ?? '组织', inv.token);
    } catch (err) {
      logger.warn({ err: String(err), orgId, email }, '[orgRoutes] 邀请邮件发送失败');
    }
    res.status(201);
    sendData(res, { id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt });
  }),
);

router.delete(
  '/invitations/:id',
  requireAdmin,
  tenantHandler(
    '[orgRoutes] 撤销邀请失败',
    'ORG_INVITATION_REVOKE_FAILED',
    async (req, res, tenantId) => {
      if (!requireUuidParam(res, req.params.id)) return;
      const ok = await revokeInvitation(tenantId, req.params.id);
      if (!ok) {
        sendProblem(res, 404, 'INVITATION_NOT_FOUND');
        return;
      }
      sendData(res, { revoked: true });
    },
  ),
);

export default router;
