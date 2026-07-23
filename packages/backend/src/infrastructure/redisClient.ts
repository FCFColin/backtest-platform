import IORedis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Architecture: Redis连接配置与健康检测
// 企业为何需要：BullMQ依赖Redis作为消息代理，ioredis是Node.js生态最成熟的Redis客户端
// 权衡：Redis是额外基础设施依赖，但性能远超pg-boss等基于数据库的方案

export const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // BullMQ requires this
  enableReadyCheck: false,
});

/**
 * 通用 Redis 客户端（应用层使用）
 *
 * 企业理由：与 BullMQ 专用 redisConnection 分离，配置不同的重连策略。
 * BullMQ 要求 maxRetriesPerRequest=null（无限重试），而应用层需要
 * 有限重试（maxRetriesPerRequest: 3）避免请求长时间挂起。
 * lazyConnect 延迟连接，Redis 不可用时不阻止应用启动。
 * 权衡：引入第二个 Redis 连接占用额外资源，但职责分离更清晰。
 */
export const appRedis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

appRedis.on('error', (err) => {
  logger.warn({ err: String(err) }, '[redis] appRedis 连接错误');
});

appRedis.on('connect', () => {
  logger.info('[redis] appRedis 连接成功');
});

appRedis.on('reconnecting', () => {
  logger.info('[redis] appRedis 重连中');
});

// ---------------------------------------------------------------------------
// Redis 健康检测（统一模块）
//
// 集中管理 Redis 连接状态，取代 refreshToken / idempotency / loginLockout /
// dataCache / backtestResultCache 各自维护的本地 boolean flag + listener + ping 实现。
//
// - 缓存最近一次 ping/事件结果（5 秒 TTL），避免高频调用
// - 监听 appRedis 的 ready/reconnecting/end/error 事件，立即更新状态
// - 异步 API getRedisHealth() / 标记 API markRedisUnhealthy()
// - markRedisUnhealthy() 供 Redis 命令执行失败时立即标记不可用，
//   避免 5 秒缓存窗口内反复重试已知不可用的 Redis

const REDIS_HEALTH_CACHE_TTL_MS = 5000;

let redisHealthCached = false;
let redisHealthLastCheck = 0;

function setRedisHealth(ok: boolean): void {
  redisHealthLastCheck = Date.now();
  redisHealthCached = ok;
}

appRedis.on('ready', () => setRedisHealth(true));
appRedis.on('reconnecting', () => setRedisHealth(false));
appRedis.on('end', () => setRedisHealth(false));
appRedis.on('error', () => setRedisHealth(false));

/**
 * 异步获取 Redis 健康状态（带 5 秒缓存）。
 *
 * @returns Redis 是否可用
 */
export async function getRedisHealth(): Promise<boolean> {
  if (Date.now() - redisHealthLastCheck < REDIS_HEALTH_CACHE_TTL_MS) {
    return redisHealthCached;
  }
  try {
    const result = await appRedis.ping();
    setRedisHealth(result === 'PONG');
    return redisHealthCached;
  } catch {
    setRedisHealth(false);
    return false;
  }
}

/**
 * 立即标记 Redis 为不可用（操作失败时调用）。
 *
 * 用于 Redis 命令执行失败但尚未触发 error 事件的场景，
 * 避免 5 秒缓存窗口内反复重试已知不可用的 Redis。
 */
export function markRedisUnhealthy(): void {
  setRedisHealth(false);
}
