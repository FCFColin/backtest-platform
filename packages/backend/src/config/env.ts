/**
 * 环境初始化与共享类型/工具函数。
 *
 * 负责加载 `.env`、计算项目根目录，并提供配置模块内共享的类型与解析函数。
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 项目根目录：从本文件位置上溯至 package.json 所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

// 加载项目根目录 .env 文件，使环境变量在 config 对象构造时可用
dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

/**
 * 应用运行环境类型
 */
export type NodeEnv = 'development' | 'production' | 'test';

/**
 * CORS 来源配置类型
 * - `true`：允许所有来源（默认，开发友好）
 * - `string[]`：仅允许指定来源
 */
type CorsOrigins = true | string[];

/**
 * 解析 JWT 签名算法（生产环境默认 RS256，开发环境默认 HS256）。
 *
 * @returns 'RS256' 或 'HS256'
 */
export function resolveJwtAlgorithm(): 'RS256' | 'HS256' {
  return (process.env.JWT_ALGORITHM ||
    ((process.env.NODE_ENV || 'development') === 'production' ? 'RS256' : 'HS256')) as
    'RS256' | 'HS256';
}

/**
 * 解析 CORS_ORIGINS 环境变量。
 *
 * @param raw - 原始环境变量值
 * @returns `true` 表示允许所有来源；否则返回来源数组
 */
export function parseCorsOrigins(raw: string | undefined): CorsOrigins {
  if (!raw || raw.trim() === '' || raw.trim() === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 读取必需的环境变量 secret，缺失时 fail-fast 抛出错误（H-006）。
 *
 * 企业理由：JWT_SECRET / ENGINE_AUTH_TOKEN / DATA_SERVICE_AUTH_TOKEN 等安全敏感配置
 * 不应有硬编码默认值——源码公开即等于密钥泄露。缺失时必须立即抛出，而非使用默认值静默启动。
 *
 * @param name - 环境变量名
 * @returns 环境变量值（非空字符串）
 * @throws 如果环境变量未设置或为空字符串
 */
export function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required. Set it in .env (see .env.example).`,
    );
  }
  return value;
}