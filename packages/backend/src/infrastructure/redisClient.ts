import IORedis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Architecture: Redis连接配置
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
