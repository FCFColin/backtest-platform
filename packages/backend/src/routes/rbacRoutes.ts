/**
 * 可配置 RBAC 管理路由（P2-01）。挂载于 /api/v1/admin（前置 admin 链）。
 * 安全约束：系统角色禁止修改/删除（双重校验）；角色 CRUD 验证租户归属（防跨租户越权）。
 * 写操作后主动失效受影响用户权限缓存。
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { requireTenantId, requireUuidParam } from './routeUtils.js';
import {
  getRolesByOrg,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  setRolePermissions,
  getUserRoles,
  assignUserRole,
  removeUserRole,
  getUserIdsByRole,
} from '../repositories/rbacRepo.js';
import {
  invalidateUserPermissions,
  invalidateOrgRolePermissions,
} from '../infrastructure/rbacCache.js';

const router = Router();

const permissionString = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z_]+:[a-z_]+$/);

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).optional(),
});

const updateRoleSchema = createRoleSchema;

const setPermissionsSchema = z.object({
  permissions: z.array(permissionString).max(50),
});

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});

/**
 * 验证目标角色属于当前租户（含系统角色，防跨租户越权操作）。
 *
 * @returns true 表示角色属于该租户；false 时已通过 res 返回 404
 */
async function verifyRoleInOrg(res: Response, roleId: string, orgId: string): Promise<boolean> {
  const roles = await getRolesByOrg(orgId);
  if (!roles.some((r) => r.id === roleId)) {
    sendProblem(res, 404, 'ROLE_NOT_FOUND');
    return false;
  }
  return true;
}

/** 统一守卫：UUID 参数校验 + 租户上下文 + 角色归属校验；任一失败已响应，返回 null。 */
async function guardRoleInOrg(
  req: AuthenticatedRequest,
  res: Response,
  idParam: string,
): Promise<string | null> {
  if (!requireUuidParam(res, idParam)) return null;
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return null;
  if (!(await verifyRoleInOrg(res, idParam, tenantId))) return null;
  return tenantId;
}

router.get('/roles', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  res.json({ success: true, data: await getRolesByOrg(tenantId) });
});

router.post(
  '/roles',
  validate(createRoleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const { name, description } = req.body as { name: string; description?: string };
    try {
      const role = await createRole(tenantId, name, description ?? null);
      res.status(201).json({ success: true, data: role });
    } catch (err) {
      if (String(err).includes('uq_roles_org_name')) {
        sendProblem(res, 409, 'ROLE_NAME_CONFLICT');
        return;
      }
      logger.error({ err: err as Error, orgId: tenantId }, '[rbacRoutes] 创建角色失败');
      sendProblem(res, 500, 'ROLE_CREATE_FAILED');
    }
  },
);

router.put(
  '/roles/:id',
  validate(updateRoleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!(await guardRoleInOrg(req, res, req.params.id))) return;
    const { name, description } = req.body as { name: string; description?: string };
    const result = await updateRole(req.params.id, name, description ?? null);
    if (result === 'not_found') {
      sendProblem(res, 404, 'ROLE_NOT_FOUND');
      return;
    }
    if (result === 'system_role') {
      sendProblem(res, 403, 'SYSTEM_ROLE_PROTECTED');
      return;
    }
    res.json({ success: true, data: result });
  },
);

router.delete('/roles/:id', async (req: AuthenticatedRequest, res: Response) => {
  if (!(await guardRoleInOrg(req, res, req.params.id))) return;
  const result = await deleteRole(req.params.id);
  if (result === 'not_found') {
    sendProblem(res, 404, 'ROLE_NOT_FOUND');
    return;
  }
  if (result === 'system_role') {
    sendProblem(res, 403, 'SYSTEM_ROLE_PROTECTED');
    return;
  }
  res.json({ success: true, data: { deleted: true } });
});

router.get('/roles/:id/permissions', async (req: AuthenticatedRequest, res: Response) => {
  if (!(await guardRoleInOrg(req, res, req.params.id))) return;
  res.json({ success: true, data: await getRolePermissions(req.params.id) });
});

router.put(
  '/roles/:id/permissions',
  validate(setPermissionsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!(await guardRoleInOrg(req, res, req.params.id))) return;
    const tenantId = req.tenantId!;
    const { permissions } = req.body as { permissions: string[] };
    const result = await setRolePermissions(req.params.id, permissions);
    if (result === 'not_found') {
      sendProblem(res, 404, 'ROLE_NOT_FOUND');
      return;
    }
    const userIds = await getUserIdsByRole(req.params.id);
    await Promise.all([
      ...userIds.map((uid) => invalidateUserPermissions(uid)),
      invalidateOrgRolePermissions(tenantId),
    ]);
    res.json({ success: true, data: { updated: true } });
  },
);

router.get('/users/:userId/roles', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUuidParam(res, req.params.userId)) return;
  res.json({ success: true, data: await getUserRoles(req.params.userId) });
});

router.post(
  '/users/:userId/roles',
  validate(assignRoleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireUuidParam(res, req.params.userId)) return;
    const { roleId } = req.body as { roleId: string };
    if (!(await guardRoleInOrg(req, res, roleId))) return;
    await assignUserRole(req.params.userId, roleId, req.tenantId ?? null);
    await invalidateUserPermissions(req.params.userId);
    res.status(201).json({ success: true, data: { assigned: true } });
  },
);

router.delete('/users/:userId/roles/:roleId', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUuidParam(res, req.params.userId)) return;
  if (!requireUuidParam(res, req.params.roleId)) return;
  const removed = await removeUserRole(req.params.userId, req.params.roleId);
  if (!removed) {
    sendProblem(res, 404, 'USER_ROLE_NOT_FOUND');
    return;
  }
  await invalidateUserPermissions(req.params.userId);
  res.json({ success: true, data: { removed: true } });
});

export default router;
