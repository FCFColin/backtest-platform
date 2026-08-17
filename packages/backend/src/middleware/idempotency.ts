import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { readEntry, redisKeys } from './tokenStore.js';
import type { AuthenticatedRequest } from './authShared.js';

// 单 key 状态机：SET NX 原子占位（并发同 key 仅一个执行），2xx 覆盖 done 供重放，非 2xx 删占位，崩溃由 TTL 兜底。
const RESULT_TTL_SEC = 3600;
const PROCESSING_TTL_SEC = 120;

interface IdemEntry {
  status: 'processing' | 'done';
  statusCode?: number;
  body?: unknown;
  timestamp: number;
}
type IdemCtx = { middleware: string; key: string; path: string; requestId: unknown };

export function idempotencyKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method.toUpperCase() !== 'POST') return next();
  const key = req.headers['idempotency-key'] as string | undefined;
  if (!key) return next();
  if (key.length > 128) {
    sendProblem(res, 400, 'INVALID_IDEMPOTENCY_KEY');
    return;
  }
  void handleWithRedis(key, req, res, next);
}
function redisUnavailable(res: Response): void {
  sendProblem(res, 503, 'REDIS_UNAVAILABLE', undefined, {
    detail: 'Idempotency key requires Redis; please retry',
    headers: { 'Retry-After': '30' },
  });
}
function finalize(redisKey: string, ctx: IdemCtx, statusCode: number, body: unknown): void {
  const entry: IdemEntry = { status: 'done', statusCode, body, timestamp: Date.now() };
  const p =
    statusCode < 300
      ? appRedis.set(redisKey, JSON.stringify(entry), 'EX', RESULT_TTL_SEC)
      : appRedis.del(redisKey);
  p.catch((err: unknown) =>
    logger.warn(
      { ...ctx, err: String(err) },
      statusCode < 300 ? '[idempotency] 结果写入失败' : '[idempotency] 占位清理失败',
    ),
  );
}

// scoped by user > tenant > IP（匿名 sub='guest' 按 IP 隔离）
function scopedRedisKey(req: Request, key: string): string {
  const user = (req as AuthenticatedRequest).user;
  const principal =
    (user?.sub !== 'guest' ? user?.sub : undefined) ?? user?.tenant_id ?? req.ip ?? 'anonymous';
  const tenantScope = user?.tenant_id;
  return redisKeys.idempotency(
    tenantScope ? `${tenantScope}:${principal}:${key}` : `${principal}:${key}`,
  );
}

async function handleWithRedis(
  key: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const redisKey = scopedRedisKey(req, key);
  if (!(await getRedisHealth())) return redisUnavailable(res);
  const ctx = { middleware: 'idempotency', key, path: req.path, requestId: req.id };
  try {
    const claim = JSON.stringify({ status: 'processing' as const, timestamp: Date.now() });
    const claimed = await appRedis.set(redisKey, claim, 'EX', PROCESSING_TTL_SEC, 'NX');
    if (claimed !== 'OK') {
      const existing = await readEntry<IdemEntry>(redisKey);
      if (existing?.status === 'done' && existing.statusCode) {
        logger.info(ctx, '[idempotency] 命中已完成结果，返回缓存响应');
        res.status(existing.statusCode).json(existing.body);
        return;
      }
      sendProblem(res, 409, 'IDEMPOTENCY_IN_FLIGHT', 'Idempotent request already in flight', {
        detail: '相同 Idempotency-Key 的请求正在处理中，请稍后重试',
        headers: { 'Retry-After': '1' },
      });
      return;
    }
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown): Response {
      finalize(redisKey, ctx, res.statusCode, body);
      return originalJson(body);
    };
    next();
  } catch (err) {
    logger.warn({ ...ctx, err: String(err) }, '[idempotency] Redis 操作异常，返回 503');
    markRedisUnhealthy();
    redisUnavailable(res);
  }
}
