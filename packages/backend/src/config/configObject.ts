/**
 * 集中配置对象合成。
 *
 * 将各配置片段（server / engine / auth / database / integrations / security / observability）
 * 合并为单一 `config` 对象，保持扁平的 `config.X` 访问路径不变（公共 API 未变）。
 */

import { authConfig } from './authConfig.js';
import { databaseConfig } from './databaseConfig.js';
import { engineConfig } from './engineConfig.js';
import { integrationsConfig } from './integrationsConfig.js';
import { observabilityConfig } from './observabilityConfig.js';
import { securityConfig } from './securityConfig.js';
import { serverConfig } from './serverConfig.js';

/**
 * 集中配置对象
 *
 * 汇总全部环境变量，提供开发环境友好的默认值。
 * 生产环境部署时请通过环境变量或 `.env` 文件覆盖。
 */
export const config = {
  ...serverConfig,
  ...engineConfig,
  ...authConfig,
  ...databaseConfig,
  ...integrationsConfig,
  ...securityConfig,
  ...observabilityConfig,
};

/** RFC 8594 Sunset 日期，用于废弃 API 头 */
export const SUNSET_DATE = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0];
