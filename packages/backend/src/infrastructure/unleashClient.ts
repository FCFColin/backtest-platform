// ADR-P1-06: 三层 fallback: SDK 缓存 → Redis 快照 → fail-closed false
import { initialize, type Unleash } from 'unleash-client';
import { logger } from '../utils/logger.js';

// SDK 未公开导出 FeatureInterface，故在此定义最小结构
interface FlagDefinition {
  name: string;
  enabled: boolean;
}

const UNLEASH_URL = process.env.UNLEASH_URL ?? 'http://127.0.0.1:4242/api';
const UNLEASH_API_TOKEN = process.env.UNLEASH_API_TOKEN ?? 'dev-unleash-token';

const FLAG_SNAPSHOT_KEY = 'unleash:flags:snapshot';
const SNAPSHOT_WRITE_THROTTLE_MS = 5 * 60 * 1000;

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

// P1-03 T6: Unleash 不可用时作为 fallback 数据源
let flagSnapshot: FlagDefinition[] | null = null;
let lastSnapshotWrite = 0;

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
    logger.debug({ err: String(err), module: 'unleash' }, '[unleash] Redis 快照加载跳过');
  }
}

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
    refreshInterval: 15,
  });

  client.on('initialized', () => {
    unleashClient.isInitialized = true;
    logger.info({ module: 'unleash' }, '[unleash] 客户端初始化成功');
    saveFlagSnapshot();
  });

  client.on('changed', () => {
    saveFlagSnapshot();
  });

  client.on('error', (err: unknown) => {
    logger.warn({ err: String(err), module: 'unleash' }, '[unleash] 客户端错误');
  });

  unleashClient.isEnabled = (flagName, context) => {
    if (client && unleashClient.isInitialized) {
      return client.isEnabled(
        flagName,
        context as { userId?: string; properties?: Record<string, string> },
      );
    }
    if (flagSnapshot) {
      return isEnabledFromSnapshot(flagName);
    }
    // fail-closed
    return false;
  };
} catch (err) {
  // 初始化失败时 flag 永久关闭（fail-closed）
  logger.warn({ err: String(err), module: 'unleash' }, '[unleash] 初始化失败，flag 默认关闭');
}

loadFlagSnapshot();

export { unleashClient };
