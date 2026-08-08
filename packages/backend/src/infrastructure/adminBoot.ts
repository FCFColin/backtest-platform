import { logger } from '../utils/logger.js';
import {
  findStaleApiKeys,
  createPlatformAdminKey,
  countActivePlatformAdminKeys,
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS,
} from '../repositories/apiKeyRepo.js';
import { apiKeysStaleCount } from '../utils/metrics.js';

const STALE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STALE_THRESHOLD_DAYS = 7;

async function refreshStaleApiKeyMetrics(thresholdDays = STALE_THRESHOLD_DAYS): Promise<void> {
  const stale = await findStaleApiKeys(thresholdDays);
  let platformCount = 0;
  let tenantCount = 0;
  for (const k of stale) {
    if (k.isPlatformAdmin) platformCount += 1;
    else tenantCount += 1;
  }
  apiKeysStaleCount.set({ is_platform_admin: 'true' }, platformCount);
  apiKeysStaleCount.set({ is_platform_admin: 'false' }, tenantCount);
  if (platformCount > 0) {
    logger.warn(
      { platformCount, tenantCount, thresholdDays },
      '[apiKeyMonitoring] 检测到陈旧的平台 break-glass 密钥（超过阈值未使用），请核查是否泄露',
    );
  }
}

export function startApiKeyMonitoring(): NodeJS.Timeout {
  void refreshStaleApiKeyMetrics().catch((err) =>
    logger.warn({ err: String(err) }, '[apiKeyMonitoring] 首次巡检失败'),
  );
  const handle = setInterval(() => {
    void refreshStaleApiKeyMetrics().catch((err) =>
      logger.warn({ err: String(err) }, '[apiKeyMonitoring] 定时巡检失败'),
    );
  }, STALE_CHECK_INTERVAL_MS);
  handle.unref();
  return handle;
}

export async function bootstrapPlatformAdminKey(): Promise<boolean> {
  const envKey = process.env.ADMIN_API_KEY;
  try {
    const active = await countActivePlatformAdminKeys();
    if (active > 0) {
      if (envKey)
        logger.warn(
          '[bootstrap] DB 已有有效平台 break-glass 密钥，环境变量 ADMIN_API_KEY 将被忽略；请删除该环境变量引用',
        );
      return false;
    }
    if (!envKey) {
      if (process.env.NODE_ENV === 'production')
        logger.warn(
          '[bootstrap] 生产环境未配置平台 break-glass 密钥（DB 无记录且环境变量 ADMIN_API_KEY 缺失）。请通过 bootstrap 环境变量或 SQL 创建',
        );
      return false;
    }
    await createPlatformAdminKey(
      envKey,
      'bootstrapped-from-env',
      PLATFORM_ADMIN_KEY_MAX_TTL_DAYS,
      null,
    );
    logger.warn(
      '[bootstrap] 已将环境变量 ADMIN_API_KEY 迁移为 DB 平台 break-glass 密钥（90 天有效）。请尽快删除环境变量引用，并通过 /api/v1/admin/keys/rotate 轮换为新随机密钥',
    );
    return true;
  } catch (err) {
    logger.error(
      { err: String(err) },
      '[bootstrap] 平台 break-glass 密钥 bootstrap 失败，请检查 DB 与迁移状态',
    );
    return false;
  }
}
