/**
 * 集中配置对象合成。
 *
 * 各配置片段（server / engine / auth / database / integrations）以命名空间形式
 * 组合为 `configNamespaces`，再通过 `Object.assign` 构建向后兼容的扁平 `config`。
 *
 * 改进点（vs 旧 spread 合并）：
 * 1. 命名空间导出 — 新代码应使用 `configNamespaces.server.API_PORT` 等命名空间路径
 * 2. 碰撞检测 — 启动时检测各片段间的 key 冲突，避免静默覆盖
 * 3. 类型安全 — `Config` 类型由各片段类型交叉推导
 */

import { authConfig } from './authConfig.js';
import { databaseConfig } from './databaseConfig.js';
import { engineConfig } from './engineConfig.js';
import { integrationsConfig } from './integrationsConfig.js';
import { serverConfig } from './serverConfig.js';

/** 扁平配置类型 — 各片段类型的交叉 */
type Config = typeof serverConfig &
  typeof engineConfig &
  typeof authConfig &
  typeof databaseConfig &
  typeof integrationsConfig;

/** 检测各配置片段间的 key 冲突，避免静默覆盖 */
function detectCollisions(): void {
  const fragments: Record<string, Record<string, unknown>> = {
    server: serverConfig,
    engine: engineConfig,
    auth: authConfig,
    database: databaseConfig,
    integrations: integrationsConfig,
  };
  const keyOwner = new Map<string, string>();
  for (const [fragName, frag] of Object.entries(fragments)) {
    for (const key of Object.keys(frag)) {
      const existing = keyOwner.get(key);
      if (existing) {
        throw new Error(
          `Config key collision: "${key}" defined in both "${existing}" and "${fragName}"`,
        );
      }
      keyOwner.set(key, fragName);
    }
  }
}

detectCollisions();

/**
 * 扁平配置对象（向后兼容）。
 *
 * 由各命名空间片段通过 `Object.assign` 合成，保持 `config.API_PORT` 等扁平访问路径。
 *
 * @deprecated 新代码请使用各 config 模块的命名空间路径（如 `serverConfig.API_PORT`）
 */
export const config: Config = Object.assign(
  {},
  serverConfig,
  engineConfig,
  authConfig,
  databaseConfig,
  integrationsConfig,
);

/**
 * 解析 RFC 8594 Sunset 日期。
 *
 * 行为：
 * - 优先读取 `DEPRECATED_SUNSET_DATE` 环境变量（ISO 8601 日期，如 `2026-12-31`），
 *   保证服务重启后 Sunset 日期不滚动，使废弃端点能自然到期。
 * - 未设置时回退到原滚动 6 个月逻辑（向后兼容），但记录 deprecation 警告：
 *   每次重启重置 Sunset 将使 RFC 8594 机制实质失效。
 *
 * @returns RFC 8594 Sunset 日期对象
 * @throws {Error} 当 `DEPRECATED_SUNSET_DATE` 设置但无法解析为有效日期时抛出
 */
function resolveSunsetDate(): Date {
  const envValue = process.env.DEPRECATED_SUNSET_DATE;
  if (envValue !== undefined && envValue !== '') {
    const parsed = new Date(envValue);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `DEPRECATED_SUNSET_DATE 无法解析为有效日期："${envValue}"（请使用 ISO 8601 格式，如 2026-12-31）`,
      );
    }
    if (parsed.getTime() < Date.now()) {
      console.warn(
        `[config] DEPRECATED_SUNSET_DATE (${envValue}) 已过期，废弃端点的 Sunset 头将指向过去日期，请更新配置或移除已废弃路由`,
      );
    }
    return parsed;
  }
  console.warn(
    '[config] DEPRECATED_SUNSET_DATE 未设置，回退到运行时滚动 6 个月 Sunset 日期。' +
      '该回退行为会随服务重启重置 Sunset，使 RFC 8594 机制实质失效；生产环境请显式设置 DEPRECATED_SUNSET_DATE（ISO 8601）。',
  );
  return new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000);
}

/** RFC 8594 Sunset 日期（Date 对象），用于废弃 API 头 */
const SUNSET_DATE = resolveSunsetDate();

/** RFC 8594 Sunset 日期（YYYY-MM-DD 字符串），用于 HTTP Sunset 头 */
export const SUNSET_DATE_STR = SUNSET_DATE.toISOString().split('T')[0];
