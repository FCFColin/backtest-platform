/**
 * Unleash 特性开关客户端单例（ADR-P1-06）
 *
 * 企业理由：特性开关解耦"发布"与"部署"——灰度放量、A/B 实验、紧急降级不再依赖
 * 重新部署。Unleash 服务端集中管理 flag 定义与策略（按 userId/orgId/plan 精准投放），
 * SDK 本地缓存 + 定期轮询（refreshInterval=15s，满足 <30s 同步要求），
 * 即使 Unleash 短暂不可用也能基于本地缓存继续决策。
 *
 * 安全降级（三层 fallback）：
 * 1. Unleash 已初始化 → SDK 内部缓存决策（正常路径）
 * 2. Unleash 未初始化/不可用 → Redis 快照（冷启动恢复，P1-03 T5/T6）
 * 3. Redis 快照也不可用 → fail-closed 返回 false
 *
 * Redis 快照（P1-03 T6）：
 * - Key: unleash:flags:snapshot
 * - 更新频率：SDK 'changed' 事件触发（约每 15s 或 flag 变更时）
 * - 5 分钟节流避免频繁写入
 * - 冷启动时异步加载，Unleash 连接前提供已知 flag 状态
 *
 * 配置：UNLEASH_URL（默认本地 http://127.0.0.1:4242/api）、
 *       UNLEASH_API_TOKEN（默认 dev-unleash-token，与 docker-compose INIT_ADMIN_API_TOKENS 对齐）。
 */
import { initialize, type Unleash } from 'unleash-client';
import { logger } from '../utils/logger.js';

/**
 * Flag 定义的最小子集（对应 SDK 内部 EnhancedFeatureInterface）。
 *
 * unleash-client SDK 未公开导出 FeatureInterface/EnhancedFeatureInterface，
 * 故在此定义满足快照序列化/反序列化所需的最小结构（name + enabled）。
 */
interface FlagDefinition {
  name: string;
  enabled: boolean;
}

const UNLEASH_URL = process.env.UNLEASH_URL ?? 'http://127.0.0.1:4242/api';
const UNLEASH_API_TOKEN = process.env.UNLEASH_API_TOKEN ?? 'dev-unleash-token';

/** Redis 快照 Key（P1-03 T6） */
const FLAG_SNAPSHOT_KEY = 'unleash:flags:snapshot';
/** 快照写入节流间隔（毫秒），避免 'changed' 事件频繁写 Redis */
const SNAPSHOT_WRITE_THROTTLE_MS = 5 * 60 * 1000;

/** Unleash 上下文（与 unleash-client SDK Context 对齐的子集） */
interface UnleashContext {
  userId?: string;
  properties?: Record<string, unknown>;
}

export interface UnleashSingleton {
  isInitialized: boolean;
  isEnabled: (flagName: string, context?: UnleashContext) => boolean;
}

const unleashClient: UnleashSingleton = {
  isInitialized: false,
  isEnabled: () => false,
};

let client: Unleash | null = null;

// ─── Redis 快照（冷启动 fallback，P1-03 T5/T6） ───

/** Redis 快照缓存：从 Redis 加载的 flag 定义，用于 Unleash 不可用时的降级 */
let flagSnapshot: FlagDefinition[] | null = null;
let lastSnapshotWrite = 0;

/**
 * 异步加载 Redis flag 快照（P1-03 T6）。
 *
 * 在模块加载后异步执行。若 Unleash 尚未初始化，快照作为
 * isEnabled 的 fallback 数据源。
 */
async function loadFlagSnapshot(): Promise<void> {
  try {
    const { redisConnection } = await import('./redisClient.js');
    const data = await redisConnection.get(FLAG_SNAPSHOT_KEY);
    if (data) {
      const parsed = JSON.parse(data) as FlagDefinition[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        flagSnapshot = parsed;
        logger.info(
          { module: 'unleash', flagCount: parsed.length },
          '[unleash] Redis 快照加载成功，作为 fallback 数据源',
        );
      }
    }
  } catch (err) {
    // Redis 不可用时静默跳过（开发环境可能未启动 Redis）
    logger.debug({ err: String(err), module: 'unleash' }, '[unleash] Redis 快照加载跳过');
  }
}

/**
 * 保存 flag 快照到 Redis（P1-03 T6）。
 *
 * SDK 'changed' 事件触发时调用。5 分钟节流避免频繁写入。
 */
async function saveFlagSnapshot(): Promise<void> {
  const now = Date.now();
  if (now - lastSnapshotWrite < SNAPSHOT_WRITE_THROTTLE_MS) return;

  if (!client) return;
  try {
    const definitions = client.getFeatureToggleDefinitions();
    if (!definitions || definitions.length === 0) return;

    const { redisConnection } = await import('./redisClient.js');
    await redisConnection.set(FLAG_SNAPSHOT_KEY, JSON.stringify(definitions), 'EX', 3600);
    lastSnapshotWrite = now;
    logger.debug(
      { module: 'unleash', flagCount: definitions.length },
      '[unleash] Redis 快照已保存',
    );
  } catch (err) {
    logger.debug({ err: String(err), module: 'unleash' }, '[unleash] Redis 快照保存跳过');
  }
}

/**
 * 从快照中查询 flag 是否启用（fallback 逻辑）。
 *
 * 快照中的 flag 仅包含 enabled 状态（无策略引擎），
 * 因此仅作为 Unleash 不可用时的粗略 fallback。
 */
function isEnabledFromSnapshot(flagName: string): boolean {
  if (!flagSnapshot) return false;
  const toggle = flagSnapshot.find((t) => t.name === flagName);
  return toggle?.enabled ?? false;
}

try {
  client = initialize({
    url: UNLEASH_URL,
    appName: 'backtest-api',
    customHeaders: { Authorization: UNLEASH_API_TOKEN },
    // <30s 同步：每 15s 拉取一次 flag 定义
    refreshInterval: 15,
  });

  client.on('initialized', () => {
    unleashClient.isInitialized = true;
    logger.info({ module: 'unleash' }, '[unleash] 客户端初始化成功');
    // 初始化成功后立即保存快照
    saveFlagSnapshot();
  });

  client.on('changed', () => {
    // flag 定义变更时保存快照到 Redis
    saveFlagSnapshot();
  });

  client.on('error', (err: unknown) => {
    // 初始化或轮询失败时保持 isInitialized 当前值；SDK 会基于本地缓存继续决策
    logger.warn({ err: String(err), module: 'unleash' }, '[unleash] 客户端错误');
  });

  unleashClient.isEnabled = (flagName, context) => {
    // 1. Unleash 已初始化 → SDK 内部缓存决策
    if (client && unleashClient.isInitialized) {
      return client.isEnabled(
        flagName,
        context as { userId?: string; properties?: Record<string, string> },
      );
    }
    // 2. Unleash 未初始化 → Redis 快照 fallback
    if (flagSnapshot) {
      return isEnabledFromSnapshot(flagName);
    }
    // 3. 无快照 → fail-closed
    return false;
  };
} catch (err) {
  // 初始化抛出异常时 flag 永久关闭（fail-closed）
  logger.warn({ err: String(err), module: 'unleash' }, '[unleash] 初始化失败，flag 默认关闭');
}

// 异步加载 Redis 快照（不阻塞模块加载，失败时静默降级到 fail-closed）
loadFlagSnapshot();

export { unleashClient };
