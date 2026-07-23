/**
 * 幂等性 Key 中间件
 *
 * 检查请求头 Idempotency-Key，若 Key 在最近 1 小时内已处理过，
 * 直接返回缓存结果，不重复执行业务逻辑。
 *
 * 企业理由：管理端点的写操作（如创建数据、修改配置）在网络抖动
 * 或客户端超时重试时可能被重复执行，导致数据重复创建或配置被
 * 反复覆盖。幂等性 Key 是 REST API 的标准实践（Stripe、AWS 均采用），
 * 让客户端能安全重试而不产生副作用。无此机制时，运维人员因网络
 * 问题重复提交，可能创建重复数据或触发重复操作。
 *
 * Redis 存储的企业理由：
 * 1. 多实例 K8s 部署——内存 Map 仅在单进程内可见，Pod A 处理的
 *    请求缓存无法被 Pod B 读取，导致幂等性保证失效；
 * 2. 进程重启不丢失——内存 Map 随进程消亡，滚动更新或 OOM 重启后
 *    幂等性窗口重置，Redis 持久化保证跨重启有效；
 * 3. 原子 check-and-set——Redis SET NX + EX 是原子操作，无需加锁，
 *    比内存 Map 的 get+set 两步操作更安全（并发窗口无竞态）。
 *
 * 权衡：引入 Redis 依赖增加基础设施复杂度，但 K8s 多副本部署下
 * 内存方案完全无法保证幂等性。开发环境 Redis 不可用时自动回退到
 * 内存 Map，确保本地开发零依赖启动。
 */

import type { Request, Response, NextFunction } from 'express';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';

/** 缓存条目 */
interface CachedResult {
  statusCode: number;
  body: unknown;
  timestamp: number;
}

/** 幂等性 Key 过期时间（1 小时，秒） */
const KEY_TTL_SEC = 3600;

/** Redis Key 前缀 */
const REDIS_KEY_PREFIX = 'idempotency:';

/**
 * 内存回退存储
 *
 * 企业理由：开发环境可能未启动 Redis，内存回退确保本地开发零依赖。
 * 生产环境 Redis 不可用时自动降级，避免因基础设施故障导致服务完全不可用。
 * 降级意味着多实例间幂等性保证失效，但单实例内仍有效，优于完全无保护。
 */
const fallbackStore = new Map<string, CachedResult>();

/** 清理间隔（10 分钟） */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 定期清理过期 Key（仅内存回退模式使用）
 *
 * 企业理由：无清理机制时 Map 无限增长导致内存泄漏。
 * 10 分钟清理一次是性能与内存的平衡点。
 */
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;
  for (const [key, entry] of fallbackStore) {
    if (now - entry.timestamp > KEY_TTL_SEC * 1000) {
      fallbackStore.delete(key);
      expiredCount++;
    }
  }
  if (expiredCount > 0) {
    logger.info(
      { middleware: 'idempotency', cleanedCount: expiredCount },
      '[idempotency] 内存回退模式过期 Key 清理',
    );
  }
}, CLEANUP_INTERVAL_MS);

if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * 幂等性 Key Express 中间件
 *
 * 仅对 POST 写操作生效。流程：
 * 1. 非 POST 请求直接放行
 * 2. 无 Idempotency-Key 头直接放行（幂等性为可选特性）
 * 3. Redis 可用时：使用 SET NX + EX 原子检查并设置
 * 4. Redis 不可用时：回退到内存 Map
 * 5. Key 已存在且未过期 → 返回缓存结果
 * 6. Key 不存在 → 拦截 res.json，缓存结果后返回
 */
export function idempotencyKey(req: Request, res: Response, next: NextFunction): void {
  // 仅对 POST 写操作生效
  if (req.method.toUpperCase() !== 'POST') {
    next();
    return;
  }

  const key = req.headers['idempotency-key'] as string | undefined;

  // 无 Key 时放行（幂等性为可选特性）
  if (!key) {
    next();
    return;
  }

  // Key 格式校验（防止恶意超长 Key 导致内存/Redis 问题）
  if (key.length > 128) {
    sendProblem(res, 400, 'INVALID_IDEMPOTENCY_KEY');
    return;
  }

  // 异步处理 Redis / 内存存储
  handleIdempotencyKey(key, req, res, next);
}

/**
 * 异步处理幂等性 Key 逻辑
 *
 * 企业理由：Redis 操作是异步的，需将中间件核心逻辑提取为异步函数。
 * Redis SET NX + EX 是原子操作，天然防止并发竞态——两个请求同时
 * 设置同一个 Key，只有一个会成功（NX 语义），失败的那个读取已缓存
 * 的结果返回，无需额外加锁。
 */
async function handleIdempotencyKey(
  key: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const redisOk = await getRedisHealth();

  if (redisOk) {
    await handleWithRedis(key, req, res, next);
  } else {
    handleWithMemory(key, req, res, next);
  }
}

/** 拦截 res.json 以缓存响应结果。 */
function interceptResponse(
  res: Response,
  storageKey: string,
  storeFn: (key: string, entry: CachedResult) => void,
): void {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown): Response {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      storeFn(storageKey, { statusCode: res.statusCode, body, timestamp: Date.now() });
    }
    return originalJson(body);
  };
}

/**
 * Redis 模式：使用 SET NX + EX 原子 check-and-set
 */
async function handleWithRedis(
  key: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const redisKey = `${REDIS_KEY_PREFIX}${key}`;

  try {
    const cached = await appRedis.get(redisKey);
    if (cached) {
      const result: CachedResult = JSON.parse(cached);
      logger.info(
        { middleware: 'idempotency', key, path: req.path, requestId: req.id },
        '[idempotency] Redis 幂等性 Key 命中缓存，返回缓存结果',
      );
      res.status(result.statusCode).json(result.body);
      return;
    }

    interceptResponse(res, redisKey, (k, entry) => {
      appRedis
        .set(k, JSON.stringify(entry), 'EX', KEY_TTL_SEC, 'NX')
        .then(() =>
          logger.info(
            { middleware: 'idempotency', key, path: req.path, requestId: req.id },
            '[idempotency] Redis 幂等性 Key 缓存写入',
          ),
        )
        .catch((err: unknown) => {
          logger.warn(
            { middleware: 'idempotency', key, err: String(err) },
            '[idempotency] Redis 缓存写入失败',
          );
        });
    });

    next();
  } catch (err) {
    logger.warn(
      { middleware: 'idempotency', key, err: String(err) },
      '[idempotency] Redis 操作异常，降级到内存存储',
    );
    markRedisUnhealthy();
    handleWithMemory(key, req, res, next);
  }
}

/**
 * 内存回退模式：使用 Map 存储
 */
function handleWithMemory(key: string, req: Request, res: Response, next: NextFunction): void {
  const cached = fallbackStore.get(key);
  if (cached && Date.now() - cached.timestamp <= KEY_TTL_SEC * 1000) {
    logger.info(
      { middleware: 'idempotency', key, path: req.path, requestId: req.id },
      '[idempotency] 内存回退模式幂等性 Key 命中缓存',
    );
    res.status(cached.statusCode).json(cached.body);
    return;
  }

  interceptResponse(res, key, (k, entry) => {
    fallbackStore.set(k, entry);
    logger.info(
      { middleware: 'idempotency', key, path: req.path, requestId: req.id },
      '[idempotency] 内存回退模式幂等性 Key 缓存写入',
    );
  });

  next();
}
