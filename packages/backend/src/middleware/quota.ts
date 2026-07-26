/**
 * 配额中间件（ADR-037 / P0-04 fail-closed）
 *
 * 企业理由：把"按计划限制资源消耗"落到请求路径上——计算/异步入队前校验本计费周期用量
 * 与单次标的数是否超出当前组织计划上限，超限以 RFC-7807 返回 402（需升级）/422（请求过大），
 * 并在放行后计量一次用量（事件 + 月度计数）。
 *
 * P0-04 变更：
 * - Redis 不可用时 fail-closed（返回 503，不是 next()），防止免费用户绕过配额限制
 * - 使用 Lua 脚本保证原子性，解决并发竞态（INCR + EXPIRE 单次原子操作）
 * - 添加 Prometheus counter `quota_enforcement_failures_total` 供告警
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
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { getMonthlyUsage, recordUsage } from '../application/billing/usageService.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { quotaEnforcementFailures } from '../utils/metrics.js';

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
 * Lua 脚本：原子 INCR + EXPIRE + 返回计数。
 *
 * 第一次 INCR 时设置 EXPIRE（TTL 窗口），后续 INCR 不重置 TTL。
 * 返回 [current, limit] 供调用方判断是否超限。
 *
 * 原子性保证：Redis 单线程执行 Lua 脚本，不会被其他命令插入，
 * 消除 INCR + EXPIRE 分离操作间的并发竞态。
 */
const QUOTA_ATOMIC_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return {current, tonumber(ARGV[1])}
`;

/** Redis 配额窗口（秒），用于短期并发请求限制（1 分钟窗口） */
const QUOTA_WINDOW_SECONDS = 60;

/**
 * 使用 Redis Lua 脚本原子递增配额计数器。
 *
 * @param key - Redis key（如 `quota:{tenantId}:{metric}`）
 * @param limit - 当前窗口允许的最大请求数
 * @returns [current, effectiveLimit] — 当前计数和有效上限
 * @throws 当 Redis 不可用时抛出异常（由调用方 fail-closed 处理）
 */
async function atomicQuotaIncrement(key: string, limit: number): Promise<[number, number]> {
  const result = (await appRedis.eval(
    QUOTA_ATOMIC_SCRIPT,
    1,
    key,
    String(limit),
    String(QUOTA_WINDOW_SECONDS),
  )) as [number, number];
  return result;
}

/**
 * 生成配额中间件：在计算/入队前校验计划配额，放行后计量。
 *
 * P0-04：Redis 不可用时 fail-closed 返回 503，不放行请求。
 * 防止免费用户在 Redis 故障期间绕过配额限制无限使用付费功能。
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

    try {
      // 1. 查询组织计划
      let plan: string | null = null;
      try {
        const org = await getOrg(tenantId);
        plan = org?.plan ?? null;
      } catch (err) {
        // P0-04：组织查询失败时 fail-closed（不再 fail-open）
        // 元数据查询失败可能是 DB 不可用，此时配额无法校验，不应放行
        logger.error({ err: String(err), tenantId }, '[quota] 组织查询失败，fail-closed');
        quotaEnforcementFailures.inc({ quota_key: metric, reason: 'org_query_failed' });
        sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', {
          detail: 'Service temporarily unavailable. Please try again later.',
          retryAfter: 30,
        });
        return;
      }

      const limits = getPlanLimits(plan);

      // 2. 单次标的数上限
      const tickerCount = extractTickerCount(req.body);
      if (tickerCount > limits.maxTickers) {
        sendProblem(res, 422, 'TICKERS_LIMIT_EXCEEDED');
        return;
      }

      // 3. Redis 原子配额计数（短期窗口限流，防并发竞态）
      const quotaKey = `quota:${tenantId}:${metric}`;
      const [current, effectiveLimit] = await atomicQuotaIncrement(
        quotaKey,
        limits.backtestsPerMonth,
      );

      if (current > effectiveLimit) {
        // 超限：返回 429 + Retry-After
        const ttl = await appRedis.ttl(quotaKey);
        quotaEnforcementFailures.inc({ quota_key: metric, reason: 'quota_exceeded' });
        sendProblem(res, 429, 'QUOTA_EXCEEDED', undefined, {
          detail: `Quota exceeded: ${current}/${effectiveLimit} ${metric}`,
          headers: { 'Retry-After': String(Math.max(ttl, 1)) },
        });
        return;
      }

      // 4. 月度用量上限（DB 持久化检查，与 Redis 短期窗口互补）
      if (Number.isFinite(limits.backtestsPerMonth)) {
        const used = await getMonthlyUsage(tenantId, metric);
        if (used >= limits.backtestsPerMonth) {
          sendProblem(res, 402, 'QUOTA_EXCEEDED');
          return;
        }
      }

      // 放行后计量（不阻断主流程）
      void recordUsage(tenantId, metric, 1, { path: req.path });
      next();
    } catch (err) {
      // P0-04：Redis 不可用时 fail-closed（返回 503，不是 next()）
      // 配额校验失败时不应放行——免费用户可能绕过配额限制无限使用付费功能
      logger.error(
        { err: String(err), tenantId, metric },
        '[quota] 配额校验失败：Redis 不可用，fail-closed 返回 503',
      );

      // 记录到 Prometheus，方便告警
      quotaEnforcementFailures.inc({ quota_key: metric, reason: 'redis_unavailable' });

      sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', {
        detail: 'Service temporarily unavailable. Please try again later.',
        retryAfter: 30,
      });
    }
  };
}
