/**
 * API Key 陈旧度监控（P0-04/T5）
 *
 * 企业理由：长期未使用的 API Key 是泄露盲区——攻击者可能持有泄露密钥而长期不被察觉。
 * 定期巡检"超过阈值天数未使用"的有效密钥，更新 Prometheus gauge 供告警。
 * 平台 break-glass 密钥超过 7 天未用即应告警（break-glass 应为应急偶发使用）。
 *
 * 仅在主进程启动一次定时巡检；DB 不可用时静默跳过（不影响鉴权热路径）。
 */
import { logger } from '../utils/logger.js';
import { findStaleApiKeys } from '../repositories/apiKeyRepo.js';
import { apiKeysStaleCount } from '../utils/metrics.js';

const STALE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** 未使用阈值天数（平台 break-glass 密钥默认 7 天）。 */
const STALE_THRESHOLD_DAYS = 7;

/**
 * 巡检一次陈旧密钥并更新 Prometheus gauge。
 *
 * @param thresholdDays - 未使用阈值天数
 */
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

/**
 * 启动陈旧密钥定时巡检。重复调用安全（返回已存在的 interval 句柄）。
 *
 * @returns NodeJS 定时器句柄（测试可 unref/clear）
 */
export function startApiKeyMonitoring(): NodeJS.Timeout {
  // 启动时立即巡检一次，随后按间隔刷新。
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
