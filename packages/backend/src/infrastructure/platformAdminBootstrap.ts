/**
 * 平台 break-glass 密钥首次启动 bootstrap（P0-04）
 *
 * 企业理由：`ADMIN_API_KEY` 从运行时配置移除后，已部署环境仍可能通过环境变量提供
 * 该值。为避免破坏现有部署，启动时若 DB 中尚无有效的平台 break-glass 密钥
 * 且环境变量 `ADMIN_API_KEY` 存在，则一次性将其迁移到 DB（argon2id 哈希 + 90 天有效期），
 * 并输出警告：迁移后应删除环境变量引用，后续通过 `/api/v1/admin/keys/rotate` 轮换。
 *
 * 该 bootstrap 仅在 initSchema 完成（api_keys 含 is_platform_admin/expires_at/key_hash_argon2
 * 列）后调用一次，幂等：DB 已有有效平台密钥时跳过。
 */
import { logger } from '../utils/logger.js';
import {
  createPlatformAdminKey,
  countActivePlatformAdminKeys,
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS,
} from '../repositories/apiKeyRepo.js';

/**
 * 若环境变量 ADMIN_API_KEY 存在且 DB 无有效平台密钥，则一次性迁移到 DB。
 *
 * 行为：
 * - DB 已有有效平台密钥 → 跳过（幂等）。
 * - 环境变量未设置 → 仅在 production 记录警告（break-glass 缺失），不阻断启动。
 * - 环境变量设置且 DB 无密钥 → 创建 DB 记录（90 天），警告须删除环境变量。
 *
 * @returns 是否执行了迁移（true=新建了 DB 记录）
 */
export async function bootstrapPlatformAdminKey(): Promise<boolean> {
  const envKey = process.env.ADMIN_API_KEY;
  try {
    const active = await countActivePlatformAdminKeys();
    if (active > 0) {
      if (envKey) {
        logger.warn(
          '[bootstrap] DB 已有有效平台 break-glass 密钥，环境变量 ADMIN_API_KEY 将被忽略；请删除该环境变量引用',
        );
      }
      return false;
    }

    if (!envKey) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn(
          '[bootstrap] 生产环境未配置平台 break-glass 密钥（DB 无记录且环境变量 ADMIN_API_KEY 缺失）。请通过 bootstrap 环境变量或 SQL 创建',
        );
      }
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
    // bootstrap 失败不阻断启动：鉴权路径仍可用 DB 既有密钥或按组织密钥
    logger.error(
      { err: String(err) },
      '[bootstrap] 平台 break-glass 密钥 bootstrap 失败，请检查 DB 与迁移 v17',
    );
    return false;
  }
}
