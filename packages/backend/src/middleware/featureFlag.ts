/**
 * Feature Flag 中间件（P2-06）
 *
 * 企业理由：按租户计划（free/pro/enterprise）和灰度量控制功能可见性。
 * 通过 Unleash 集中管理 flag 定义，避免代码硬编码开关。
 *
 * 用法：
 *   import { requireFeature } from './middleware/featureFlag.js';
 *   router.post('/monte-carlo', requireFeature('monte_carlo'), handler);
 *
 * 降级行为：Unleash 不可用时 fail-closed（返回 404），防止未授权访问。
 */

import type { Request, Response, NextFunction } from 'express';
import { unleashClient } from '../infrastructure/unleashClient.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from './authTypes.js';

/**
 * 创建 Feature Flag 守卫中间件。
 *
 * 当 flag 关闭时返回 404（而非 403），避免暴露端点存在。
 * Unleash 不可用时 fail-closed（同样返回 404）。
 *
 * @param flagName - Unleash 中定义的 feature flag 名称
 * @returns Express 中间件
 */
export function requireFeature(flagName: string) {
  return function featureGuard(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    // 构建 Unleash 上下文（按租户/用户/计划维度投放）
    const context = {
      userId: req.user?.sub,
      tenantId: req.user?.tenant_id,
      properties: {
        plan: (req.user as { plan?: string } | undefined)?.plan ?? 'free',
      },
    };

    const enabled = unleashClient.isEnabled(flagName, context);

    if (!enabled) {
      // fail-closed：flag 关闭或 Unleash 不可用 → 404
      sendProblem(res, 404, 'NOT_FOUND', 'Resource Not Found');
      return;
    }

    next();
  };
}
