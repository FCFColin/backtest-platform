/**
 * 配额中间件（ADR-037）
 *
 * 企业理由：把"按计划限制资源消耗"落到请求路径上——计算/异步入队前校验本计费周期用量
 * 与单次标的数是否超出当前组织计划上限，超限以 RFC-7807 返回 402（需升级）/422（请求过大），
 * 并在放行后计量一次用量（事件 + 月度计数）。
 *
 * 纪律：
 * - 无活跃租户（匿名本地开发）直接放行，保持零摩擦（与 computePermission 一致）。
 * - 平台管理员（break-glass）放行，不受租户配额约束。
 * - 计量为放行后触发，失败不阻断主流程（usageService 内部已容错）。
 */
import { type Response, type NextFunction } from 'express';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { type AuthenticatedRequest } from './jwtAuth.js';
import { getOrg } from '../services/membershipService.js';
import { getPlanLimits } from '../services/planLimitsService.js';
import { getMonthlyUsage, recordUsage } from '../services/usageService.js';

/** 从常见请求体形态推断标的数量（tickers/assets/symbols） */
function extractTickerCount(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const b = body as Record<string, unknown>;
  for (const field of ['tickers', 'symbols', 'assets']) {
    const v = b[field];
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

/**
 * 生成配额中间件：在计算/入队前校验计划配额，放行后计量。
 *
 * @param metric - 计量指标名（usage_counters.metric）
 * @returns Express 中间件
 */
export function enforceQuota(metric: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    // 无租户上下文（匿名/本地开发）或平台管理员：放行
    if (!tenantId || req.user?.platform_admin === true) {
      next();
      return;
    }

    let plan: string | null = null;
    try {
      const org = await getOrg(tenantId);
      plan = org?.plan ?? null;
    } catch (err) {
      // 查询失败时不应误伤合法请求，记录后放行（fail-open 仅限元数据查询失败）
      logger.warn({ err: String(err), tenantId }, '[quota] 组织查询失败，跳过配额校验');
      next();
      return;
    }
    const limits = getPlanLimits(plan);

    // 1. 单次标的数上限
    const tickerCount = extractTickerCount(req.body);
    if (tickerCount > limits.maxTickers) {
      sendProblem(res, 422, 'TICKERS_LIMIT_EXCEEDED', 'Unprocessable Entity', {
        detail: `当前计划单次最多支持 ${limits.maxTickers} 个标的（本次 ${tickerCount} 个），请减少标的数或升级计划`,
      });
      return;
    }

    // 2. 月度用量上限
    if (Number.isFinite(limits.backtestsPerMonth)) {
      const used = await getMonthlyUsage(tenantId, metric);
      if (used >= limits.backtestsPerMonth) {
        sendProblem(res, 402, 'QUOTA_EXCEEDED', 'Payment Required', {
          detail: `本月计算次数已达计划上限（${limits.backtestsPerMonth} 次），请升级计划以继续使用`,
        });
        return;
      }
    }

    // 放行后计量（不阻断主流程）
    void recordUsage(tenantId, metric, 1, { path: req.path });
    next();
  };
}
