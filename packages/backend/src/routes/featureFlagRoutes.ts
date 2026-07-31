/**
 * 特性开关查询路由（ADR-P1-06）
 *
 * 挂载于 /api/v1/feature-flags，app.ts 前置链：jwtAuth。
 * 返回当前用户可见的 flag 状态，供前端按 flag 渲染功能开关。
 * 仅暴露白名单内的 flag，避免泄露内部运维 flag 名称。
 */
import { Router, type Response } from 'express';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import {
  isEnabled,
  logFlagAccess,
  PLAN_LIMIT_FLAGS,
  type FlagContext,
} from '../config/index.js';

const router = Router();

/**
 * 当前用户可见的 flag 白名单。
 * 仅暴露前端所需的开关，避免泄露内部运维 flag。
 */
const VISIBLE_FLAGS = [
  PLAN_LIMIT_FLAGS.enterpriseQuota,
  PLAN_LIMIT_FLAGS.proAnalytics,
  'ui.new-dashboard',
] as const;

/** GET /api/v1/feature-flags — 返回当前用户可见的所有 flag 状态 */
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const context: FlagContext = {
    userId: req.user?.sub,
    orgId: req.user?.tenant_id,
  };

  const flags: Record<string, boolean> = {};
  for (const name of VISIBLE_FLAGS) {
    const enabled = isEnabled(name, context);
    flags[name] = enabled;
    logFlagAccess(name, context, enabled);
  }

  res.json({ success: true, data: { flags } });
});

export default router;
