/**
 * Worker 健康检查机制（P0-1）
 *
 * Worker 进程每 15s 向 Redis 写入 heartbeat key，健康检查端读取该 key。
 * 超过 45s 未更新则判定为不健康——用于 Docker HEALTHCHECK 和 K8s livenessProbe。
 *
 * Architecture: Redis heartbeat（轻量，复用 appRedis 连接）
 * 企业为何需要：Worker 无 HTTP 端口，无法用 httpGet 探针；Redis heartbeat 是
 * 进程健康信号的标准模式，Docker/K8s 都能用 exec 探针读取。
 */
import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';

/** Heartbeat key 前缀 */
const HEARTBEAT_KEY = 'worker:heartbeat';

const HEARTBEAT_INTERVAL_MS = 15_000;

/** Heartbeat 超时阈值（45 秒，3 个间隔） */
const HEARTBEAT_TIMEOUT_MS = 45_000;

/**
 * 启动 Redis heartbeat 定时器。
 *
 * 每 15s 向 Redis SET `worker:heartbeat` = ISO timestamp，TTL = 45s。
 * 进程崩溃时 key 自动过期，健康检查端检测到 key 不存在即判定不健康。
 *
 * @returns setInterval 句柄（关闭时 clearInterval）
 */
export function startHeartbeat(): ReturnType<typeof setInterval> {
  void writeHeartbeat();

  const timer = setInterval(() => {
    void writeHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // 防止 timer 阻止进程退出
  if (timer.unref) {
    timer.unref();
  }

  logger.info(
    { intervalMs: HEARTBEAT_INTERVAL_MS, key: HEARTBEAT_KEY },
    '[heartbeat] Worker heartbeat started',
  );

  return timer;
}

async function writeHeartbeat(): Promise<void> {
  try {
    const now = new Date().toISOString();
    await appRedis.set(HEARTBEAT_KEY, now, 'PX', HEARTBEAT_TIMEOUT_MS);
  } catch (err) {
    logger.warn({ err: String(err) }, '[heartbeat] Failed to write heartbeat');
  }
}

/**
 * 检查 Worker heartbeat 是否存活。
 *
 * 读取 Redis 中的 heartbeat key，存在且未过期则健康。
 * 用于 Docker HEALTHCHECK 和 K8s exec 探针。
 *
 * @returns heartbeat 是否存活
 */
async function checkHeartbeat(): Promise<boolean> {
  try {
    const value = await appRedis.get(HEARTBEAT_KEY);
    return value !== null;
  } catch {
    return false;
  }
}

/**
 * 健康检查入口（供 Docker HEALTHCHECK 和 K8s exec 探针调用）。
 *
 * 退出码 0 = 健康，1 = 不健康。
 */
async function healthCheckMain(): Promise<void> {
  const healthy = await checkHeartbeat();
  if (healthy) {
    logger.info('[health-check] Worker is healthy');
    process.exit(0);
  } else {
    logger.error('[health-check] Worker is unhealthy (heartbeat missing)');
    process.exit(1);
  }
}

// 当直接执行此文件时运行健康检查
if (import.meta.url === `file://${process.argv[1]}`) {
  void healthCheckMain();
}
