import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { tenantHandler, requireTenantId, requireUuidParam, sendData } from './routeUtils.js';
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

const router = Router();

const ROLE_ENUM = z.enum(['owner', 'admin', 'analyst', 'readonly']);

const requireAdmin = requirePermission(Permission.ADMIN_ACCESS);

const acceptSchema = z.object({ token: z.string().min(1).max(256) });
router.post(
  '/invitations/accept',
  validate(acceptSchema),
  async (req: AuthenticatedRequest, res: Response) => {
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
);

router.use(requireTenant);

router.get('/members', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  sendData(res, await listOrgMembers(tenantId));
});

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
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireUuidParam(res, req.params.userId)) return;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    sendMemberOutcome(
      res,
      await updateMemberRole(
        tenantId,
        req.params.userId,
        (req.body as { role: 'owner' | 'admin' | 'analyst' | 'readonly' }).role,
      ),
      { updated: true },
    );
  },
);

router.delete(
  '/members/:userId',
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireUuidParam(res, req.params.userId)) return;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    sendMemberOutcome(res, await removeMember(tenantId, req.params.userId), { removed: true });
  },
);

router.get('/invitations', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  sendData(res, await listInvitations(tenantId));
});

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
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireUuidParam(res, req.params.id)) return;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const ok = await revokeInvitation(tenantId, req.params.id);
    if (!ok) {
      sendProblem(res, 404, 'INVITATION_NOT_FOUND');
      return;
    }
    sendData(res, { revoked: true });
  },
);

export default router;
