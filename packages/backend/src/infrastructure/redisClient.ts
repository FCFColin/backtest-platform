import IORedis, { type RedisOptions } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Architecture: Redis Sentinel 高可用连接配置（ADR-045）
// 企业为何需要：单实例 Redis 是单点故障，master Pod 挂掉 = 全平台认证失效。
// Sentinel 模式下 ioredis 自动向 Sentinel 查询 master 地址，故障转移后自动重连新 master。
// 权衡：Sentinel 拓扑（1主+2从+3Sentinel=6 Pod）资源占用更高，但 100K MAU 下无需分片，
// Sentinel 比 Cluster 运维更简单且 BullMQ 兼容性更好（ADR-045 方案对比）。

// ---------------------------------------------------------------------------
// Redis 连接选项构造（Sentinel 优先，回退 REDIS_URL 单实例）
//
// 解析逻辑：
// 1. config.REDIS_SENTINELS 非空 → Sentinel 模式（生产）
// 2. 否则 → 解析 REDIS_URL 为单实例选项（开发回退，ADR-045 向后兼容）
//
// BullMQ 与应用层共用此构造逻辑，避免 backtestQueue.ts 重复解析。
// ---------------------------------------------------------------------------

/** Sentinel 节点主机:端口对 */
interface SentinelNode {
  host: string;
  port: number;
}

/**
 * 解析 REDIS_SENTINELS 环境变量（逗号分隔的 host:port 列表）为 Sentinel 节点数组。
 *
 * @returns Sentinel 节点数组；REDIS_SENTINELS 未设置时返回 null
 */
function parseSentinels(): SentinelNode[] | null {
  const raw = config.REDIS_SENTINELS.trim();
  if (!raw) return null;
  const nodes: SentinelNode[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [host, portStr] = trimmed.split(':');
    if (!host) {
      logger.warn({ sentinel: trimmed }, '[redis] Sentinel 条目缺少 host，已忽略');
      continue;
    }
    nodes.push({ host, port: portStr ? Number(portStr) : 26379 });
  }
  return nodes.length > 0 ? nodes : null;
}

/**
 * 解析 REDIS_URL（支持 redis:// 与 rediss://、含凭证与库号）为 ioredis 选项。
 *
 * BullMQ/ioredis 的 connection 只接受标准 ioredis 选项（host/port/password/db/tls），
 * 没有 connectionString 字段——传入它会被忽略并回退到默认 127.0.0.1:6379。
 */
function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const options: RedisOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  // 优先使用 REDIS_PASSWORD 环境变量，否则取 URL 中的凭证
  if (config.REDIS_PASSWORD) {
    options.password = config.REDIS_PASSWORD;
  } else if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }
  const db = parsed.pathname.replace(/^\//, '');
  if (db) options.db = Number(db);
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

/** Sentinel 模式是否启用（生产环境） */
export const isSentinelMode = parseSentinels() !== null;

// ---------------------------------------------------------------------------
// P0-3：Redis 模式生产断言
//
// 生产环境必须使用 Sentinel 高可用——单机 Redis 是单点故障，
// master Pod 挂掉 = 全平台认证/限流/队列失效。
// Staging 环境允许单机但发出警告（建议与生产保持一致）。
// 开发环境允许单机模式（零额外依赖）。
// ---------------------------------------------------------------------------
if (config.NODE_ENV === 'production' && !isSentinelMode) {
  throw new Error(
    'FATAL: Production environment requires Redis Sentinel ' +
      '(REDIS_SENTINELS must be configured with at least 3 nodes). ' +
      'Single-node Redis is not acceptable in production.',
  );
}

if (config.NODE_ENV === 'staging' && !isSentinelMode) {
  logger.warn(
    { mode: 'standalone' },
    'WARN: Staging environment using standalone Redis. ' +
      'Consider switching to Sentinel for production parity.',
  );
}

/**
 * 构造基础 Redis 连接选项（Sentinel 或单实例）。
 *
 * 不包含 maxRetriesPerRequest/enableReadyCheck/lazyConnect 等差异化配置，
 * 由调用方按用途（BullMQ vs 应用层）注入。
 * @returns ioredis RedisOptions
 */
export function buildRedisBaseOptions(): RedisOptions {
  const sentinels = parseSentinels();
  if (sentinels) {
    const opts: RedisOptions = {
      sentinels,
      name: config.REDIS_SENTINEL_NAME,
    };
    if (config.REDIS_PASSWORD) {
      // Sentinel 模式下 password 用于 Redis 数据节点；
      // sentinelPassword 单独配置（此处与数据节点同密码，简化运维）
      opts.password = config.REDIS_PASSWORD;
      opts.sentinelPassword = config.REDIS_PASSWORD;
    }
    return opts;
  }
  return parseRedisUrl(config.REDIS_URL);
}

// Security (T-28 / 输出过滤)：仅记录连接模式与是否配置凭证，绝不记录 URL/密码片段
logger.info(
  {
    mode: isSentinelMode ? 'sentinel' : 'standalone',
    sentinelName: isSentinelMode ? config.REDIS_SENTINEL_NAME : undefined,
    hasPassword: Boolean(config.REDIS_PASSWORD),
  },
  '[redis] 连接配置已初始化',
);

// ---------------------------------------------------------------------------
// BullMQ 专用连接（maxRetriesPerRequest=null，无限重试）
// ---------------------------------------------------------------------------

/**
 * BullMQ 专用 Redis 连接。
 *
 * maxRetriesPerRequest=null 是 BullMQ 硬性要求（队列阻塞读取需无限重试）。
 * enableReadyCheck=false 避免 BullMQ 启动时与 Redis 就绪检查竞态。
 */
export const redisConnection = new IORedis({
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: null, // BullMQ requires this
  enableReadyCheck: false,
});

// ---------------------------------------------------------------------------
// 应用层通用 Redis 客户端（maxRetriesPerRequest=3，有限重试）
// ---------------------------------------------------------------------------

/**
 * 通用 Redis 客户端（应用层使用）。
 *
 * 企业理由：与 BullMQ 专用 redisConnection 分离，配置不同的重连策略。
 * BullMQ 要求 maxRetriesPerRequest=null（无限重试），而应用层需要
 * 有限重试（maxRetriesPerRequest: 3）避免请求长时间挂起。
 * lazyConnect 延迟连接，Redis 不可用时不阻止应用启动。
 * 权衡：引入第二个 Redis 连接占用额外资源，但职责分离更清晰。
 */
export const appRedis = new IORedis({
  ...buildRedisBaseOptions(),
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

// ---------------------------------------------------------------------------
// Sentinel master 健康检测（T6 / ADR-045）
//
// 在 Sentinel 模式下，ping 成功只能证明当前连接的节点存活，无法证明
// "该节点是 master"或"从节点拓扑健康"。本函数通过 INFO replication 检查：
// - role:master —— 当前节点确为 master（Sentinel 故障转移后，旧 master 应已降级）
// - connected_slaves >= 1 —— 至少有 1 个从节点同步（min-slaves-to-write 前置条件）
//
// 在非 Sentinel 模式下直接返回 null（不参与就绪判定，仅 ping 已足够）。
// 健康路由 /api/ready 消费此结果：Sentinel 模式下 master 健康false 即 503。
// ---------------------------------------------------------------------------

export interface SentinelMasterHealth {
  /** 当前节点是否为 master（Sentinel 模式下；非 Sentinel 模式为 null） */
  isMaster: boolean | null;
  /** 已连接从节点数（Sentinel 模式下；非 Sentinel 模式为 null） */
  connectedSlaves: number | null;
}

/**
 * 查询 Redis 复制状态（Sentinel 模式下用于 master 健康检查）。
 *
 * @returns Sentinel 模式返回 {isMaster, connectedSlaves}；非 Sentinel 模式返回 {isMaster: null, connectedSlaves: null}
 */
export async function checkSentinelMaster(): Promise<SentinelMasterHealth> {
  if (!isSentinelMode) {
    return { isMaster: null, connectedSlaves: null };
  }
  try {
    // INFO replication 返回纯文本，需解析 role:master 与 connected_slaves:N
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
