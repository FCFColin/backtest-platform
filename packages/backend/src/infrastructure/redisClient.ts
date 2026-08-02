import IORedis, { type RedisOptions } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Architecture: Redis Sentinel 高可用连接（ADR-045）
// 单实例 Redis 是单点故障；Sentinel 模式下 ioredis 自动查询 master 地址，故障转移后自动重连新 master。
// 权衡：1主+2从+3Sentinel 资源占用更高，但 100K MAU 无需分片，Sentinel 比 Cluster 运维更简单且 BullMQ 兼容性更好。

interface SentinelNode {
  host: string;
  port: number;
}

function parseSentinels(): SentinelNode[] | null {
  const raw = config.REDIS_SENTINELS;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const nodes: SentinelNode[] = [];
  for (const part of trimmed.split(',')) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;
    const [host, portStr] = trimmedPart.split(':');
    if (!host) {
      logger.warn({ sentinel: trimmedPart }, '[redis] Sentinel 条目缺少 host，已忽略');
      continue;
    }
    nodes.push({ host, port: portStr ? Number(portStr) : 26379 });
  }
  return nodes.length > 0 ? nodes : null;
}

function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const options: RedisOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (config.REDIS_PASSWORD) options.password = config.REDIS_PASSWORD;
  else if (parsed.password) options.password = decodeURIComponent(parsed.password);
  const db = parsed.pathname.replace(/^\//, '');
  if (db) options.db = Number(db);
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

export const isSentinelMode = parseSentinels() !== null;

// P0-3：生产必须 Sentinel（单机 Redis 是单点故障，master 挂掉 = 全平台认证/限流/队列失效）；staging 警告；开发允许单机
if (config.NODE_ENV === 'production' && !isSentinelMode) {
  throw new Error(
    'FATAL: Production environment requires Redis Sentinel (REDIS_SENTINELS must be configured with at least 3 nodes). Single-node Redis is not acceptable in production.',
  );
}
if (config.NODE_ENV === 'staging' && !isSentinelMode) {
  logger.warn(
    { mode: 'standalone' },
    'WARN: Staging environment using standalone Redis. Consider switching to Sentinel for production parity.',
  );
}

export function buildRedisBaseOptions(): RedisOptions {
  const sentinels = parseSentinels();
  if (sentinels) {
    const opts: RedisOptions = { sentinels, name: config.REDIS_SENTINEL_NAME };
    if (config.REDIS_PASSWORD) {
      opts.password = config.REDIS_PASSWORD;
      opts.sentinelPassword = config.REDIS_PASSWORD;
    }
    return opts;
  }
  if (config.REDIS_URL) return parseRedisUrl(config.REDIS_URL);
  return {}; // 未配置时回退 ioredis 默认 127.0.0.1:6379，仅开发/测试使用
}

// Security (T-28)：仅记录连接模式与是否配置凭证，绝不记录 URL/密码片段
logger.info(
  {
    mode: isSentinelMode ? 'sentinel' : 'standalone',
    sentinelName: isSentinelMode ? config.REDIS_SENTINEL_NAME : undefined,
    hasPassword: Boolean(config.REDIS_PASSWORD),
  },
  '[redis] 连接配置已初始化',
);

export const redisConnection = new IORedis({
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: null, // BullMQ requires this
  enableReadyCheck: false,
});

export const appRedis = new IORedis({
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

appRedis.on('error', (err) => logger.warn({ err: String(err) }, '[redis] appRedis 连接错误'));
appRedis.on('connect', () => logger.info('[redis] appRedis 连接成功'));
appRedis.on('reconnecting', () => logger.info('[redis] appRedis 重连中'));

// Redis 健康检测：集中管理连接状态，取代各模块本地 boolean flag + listener + ping 实现。
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

export async function getRedisHealth(): Promise<boolean> {
  if (Date.now() - redisHealthLastCheck < REDIS_HEALTH_CACHE_TTL_MS) return redisHealthCached;
  try {
    const result = await appRedis.ping();
    setRedisHealth(result === 'PONG');
    return redisHealthCached;
  } catch {
    setRedisHealth(false);
    return false;
  }
}

export function markRedisUnhealthy(): void {
  setRedisHealth(false);
}

// Sentinel master 健康检测（T6 / ADR-045）
// ping 成功只能证明当前节点存活，无法证明"是 master"或"从节点拓扑健康"。
// 通过 INFO replication 检查 role:master 与 connected_slaves>=1；非 Sentinel 模式返回 null（仅 ping 已足够）。
interface SentinelMasterHealth {
  isMaster: boolean | null; // 当前节点是否为 master（非 Sentinel 模式为 null）
  connectedSlaves: number | null; // 已连接从节点数（非 Sentinel 模式为 null）
}

export async function checkSentinelMaster(): Promise<SentinelMasterHealth> {
  if (!isSentinelMode) return { isMaster: null, connectedSlaves: null };
  try {
    const info = (await appRedis.info('replication')) as string;
    const roleMatch = info.match(/^role:([a-z]+)/m);
    const slavesMatch = info.match(/^connected_slaves:(\d+)/m);
    return {
      isMaster: roleMatch ? roleMatch[1] === 'master' : false,
      connectedSlaves: slavesMatch ? Number.parseInt(slavesMatch[1], 10) : 0,
    };
  } catch {
    return { isMaster: false, connectedSlaves: 0 };
  }
}
