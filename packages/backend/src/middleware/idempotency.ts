import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { readEntry, redisKeys } from './tokenStore.js';
import type { AuthenticatedRequest } from './authShared.js';

interface CachedResult {
  statusCode: number;
  body: unknown;
  timestamp: number;
}
const KEY_TTL_SEC = 3600;

export function idempotencyKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method.toUpperCase() !== 'POST') {
    next();
    return;
  }
  const key = req.headers['idempotency-key'] as string | undefined;
  if (!key) {
    next();
    return;
  }
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
function idemCtx(req: Request, key: string): Record<string, unknown> {
  return { middleware: 'idempotency', key, path: req.path, requestId: req.id };
}
async function handleWithRedis(
  key: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = (req as AuthenticatedRequest).user?.tenant_id ?? req.ip ?? 'anonymous';
  const redisKey = redisKeys.idempotency(`${principal}:${key}`);
  if (!(await getRedisHealth())) return redisUnavailable(res);
  try {
    const cached = await readEntry<CachedResult>(redisKey);
    if (cached) {
      logger.info(idemCtx(req, key), '[idempotency] Redis 幂等性 Key 命中缓存，返回缓存结果');
      res.status(cached.statusCode).json(cached.body);
      return;
    }
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown): Response {
      if (res.statusCode >= 200 && res.statusCode < 300)
        appRedis
          .set(
            redisKey,
            JSON.stringify({ statusCode: res.statusCode, body, timestamp: Date.now() }),
            'EX',
            KEY_TTL_SEC,
            'NX',
          )
          .then(() => logger.info(idemCtx(req, key), '[idempotency] Redis 幂等性 Key 缓存写入'))
          .catch((err: unknown) =>
            logger.warn(
              { middleware: 'idempotency', key, err: String(err) },
              '[idempotency] Redis 缓存写入失败',
            ),
          );
      return originalJson(body);
    };
    next();
  } catch (err) {
    logger.warn(
      { middleware: 'idempotency', key, err: String(err) },
      '[idempotency] Redis 操作异常，返回 503',
    );
    markRedisUnhealthy();
    redisUnavailable(res);
  }
}
