// ADR-036 / P0-04: 组织查询失败时 fail-closed 503（防免费用户绕过）；月度用量以 usage_counters（DB 权威）为准
import { type Response, type NextFunction } from 'express';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { type AuthenticatedRequest } from './jwtAuth.js';
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { getMonthlyUsage, recordUsage } from '../application/billing/usageService.js';
import { quotaEnforcementFailures } from '../utils/metrics.js';

function extractTickerCount(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const countList = (v: unknown): number =>
    Array.isArray(v)
      ? v.length
      : typeof v === 'string'
        ? v.split(/[\s,]+/).filter(Boolean).length
        : 0;
  const b = body as Record<string, unknown>;
  const portfolios = [b.portfolio, ...(Array.isArray(b.portfolios) ? b.portfolios : [])];
  let count = 0;
  for (const entry of [
    b,
    ...portfolios.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object'),
  ]) {
    for (const field of ['tickers', 'symbols', 'assets']) count += countList(entry[field]);
  }
  return count;
}

export function enforceQuota(metric: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.method === 'GET') {
      next();
      return;
    }
    const tenantId = req.tenantId;
    // 平台管理员无组织归属，仍享受豁免（break-glass）
    if (req.user?.platform_admin === true) {
      next();
      return;
    }
    if (!tenantId) {
      // 无组织归属的普通用户（注册后未被分配 / 已被移出组织）不得绕过配额
      sendProblem(res, 400, 'NO_ACTIVE_TENANT', 'No active tenant', {
        detail: 'No active organization context for quota enforcement.',
      });
      return;
    }

    try {
      let plan: string | null = null;
      try {
        const org = await getOrg(tenantId);
        plan = org?.plan ?? null;
        if (org?.status === 'suspended') {
          quotaEnforcementFailures.inc({ quota_key: metric, reason: 'org_suspended' });
          sendProblem(res, 402, 'ORG_SUSPENDED', 'Organization suspended', {
            detail: 'Billing suspended. Please renew your subscription.',
          });
          return;
        }
      } catch (err) {
        // P0-04：组织查询失败时 fail-closed（不再 fail-open）
        logger.error({ err: String(err), tenantId }, '[quota] 组织查询失败，fail-closed');
        quotaEnforcementFailures.inc({ quota_key: metric, reason: 'org_query_failed' });
        sendProblem(
          res,
          503,
          'SERVICE_TEMPORARILY_UNAVAILABLE',
          'Service temporarily unavailable',
          {
            detail: 'Service temporarily unavailable. Please try again later.',
            headers: { 'Retry-After': '30' },
          },
        );
        return;
      }

      const limits = getPlanLimits(plan);

      const tickerCount = extractTickerCount(req.body);
      if (tickerCount > limits.maxTickers) {
        sendProblem(res, 422, 'TICKERS_LIMIT_EXCEEDED');
        return;
      }

      if (Number.isFinite(limits.backtestsPerMonth)) {
        const used = await getMonthlyUsage(tenantId, metric);
        if (used >= limits.backtestsPerMonth) {
          sendProblem(res, 402, 'QUOTA_EXCEEDED');
          return;
        }
      }

      void recordUsage(tenantId, metric, 1, { path: req.path });
      next();
    } catch (err) {
      // P0-04：用量校验失败时 fail-closed（返回 503，不是 next()）
      logger.error(
        { err: String(err), tenantId, metric },
        '[quota] 配额校验失败：fail-closed 返回 503',
      );

      quotaEnforcementFailures.inc({ quota_key: metric, reason: 'usage_check_failed' });

      sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', 'Service temporarily unavailable', {
        detail: 'Service temporarily unavailable. Please try again later.',
        headers: { 'Retry-After': '30' },
      });
    }
  };
}
