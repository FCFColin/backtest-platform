import { type Response, type NextFunction, type RequestHandler } from 'express';
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

type OrgStatus =
  { ok: true; plan: string | null } | { ok: false; reason: 'org_suspended' | 'org_query_failed' };

async function getOrgStatus(tenantId: string): Promise<OrgStatus> {
  try {
    const org = await getOrg(tenantId);
    return org?.status === 'suspended'
      ? { ok: false, reason: 'org_suspended' }
      : { ok: true, plan: org?.plan ?? null };
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[quota] 组织查询失败，fail-closed');
    return { ok: false, reason: 'org_query_failed' };
  }
}

function sendOrgProblem(res: Response, reason: 'org_suspended' | 'org_query_failed'): void {
  if (reason === 'org_suspended') {
    sendProblem(res, 402, 'ORG_SUSPENDED', 'Organization suspended', {
      detail: 'Billing suspended. Please renew your subscription.',
    });
    return;
  }
  sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', 'Service temporarily unavailable', {
    detail: 'Service temporarily unavailable. Please try again later.',
    headers: { 'Retry-After': '30' },
  });
}

// 非 compute 路由的组织停用检查（挂 orgs/billing/workspace 链，补齐 quota 只覆盖 compute 的缺口）；平台管理员豁免
export function enforceOrgActive(): RequestHandler {
  return (req, res, next) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.platform_admin === true || !authReq.tenantId) {
      next();
      return;
    }
    void (async () => {
      const status = await getOrgStatus(authReq.tenantId!);
      if (status.ok) {
        next();
        return;
      }
      quotaEnforcementFailures.inc({ quota_key: 'org_active', reason: status.reason });
      sendOrgProblem(res, status.reason);
    })();
  };
}

export function enforceQuota(metric: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.method === 'GET' || req.user?.platform_admin === true) {
      next();
      return;
    }
    if (!req.tenantId) {
      sendProblem(res, 400, 'NO_ACTIVE_TENANT', 'No active tenant', {
        detail: 'No active organization context for quota enforcement.',
      });
      return;
    }
    try {
      const status = await getOrgStatus(req.tenantId);
      if (!status.ok) {
        quotaEnforcementFailures.inc({ quota_key: metric, reason: status.reason });
        sendOrgProblem(res, status.reason);
        return;
      }
      const limits = getPlanLimits(status.plan);
      if (extractTickerCount(req.body) > limits.maxTickers) {
        sendProblem(res, 422, 'TICKERS_LIMIT_EXCEEDED');
        return;
      }
      if (Number.isFinite(limits.backtestsPerMonth)) {
        const used = await getMonthlyUsage(req.tenantId, metric);
        if (used >= limits.backtestsPerMonth) {
          sendProblem(res, 402, 'QUOTA_EXCEEDED');
          return;
        }
      }
      // 计数尽力而为：fire-and-forget 不阻塞请求（异步写失败不构成越权面）
      void recordUsage(req.tenantId, metric, 1, { path: req.path });
      next();
    } catch (err) {
      logger.error(
        { err: String(err), tenantId: req.tenantId, metric },
        '[quota] usage check failed, 503',
      );
      quotaEnforcementFailures.inc({ quota_key: metric, reason: 'usage_check_failed' });
      sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', 'Service temporarily unavailable', {
        detail: 'Service temporarily unavailable. Please try again later.',
        headers: { 'Retry-After': '30' },
      });
    }
  };
}
