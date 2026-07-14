/**
 * 服务器与基础配置片段。
 *
 * 涵盖运行环境、静态资源服务、端口、CORS、反向代理、限流、应用基础 URL 及文件路径。
 */

import path from 'path';
import { parseCorsOrigins, PROJECT_ROOT, type NodeEnv } from './env.js';

/**
 * 服务器与基础配置片段。
 */
export const serverConfig = {
  /**
   * 当前运行环境。
   * - `development`：开发环境（默认，错误详情会返回客户端便于调试）
   * - `production`：生产环境（需设置 `ADMIN_API_KEY`，隐藏错误详情）
   * - `test`：测试环境
   */
  NODE_ENV: (process.env.NODE_ENV || 'development') as NodeEnv,

  /**
   * 托管前端 dist/ 静态资源（与生产/Docker 一致）。
   *
   * API 直接服务预构建产物，避免 Vite dev 按需编译导致首屏 60s+。
   * 开发环境默认 true（可通过 SERVE_STATIC=false 关闭），生产环境始终 true。
   * @default true（开发环境启用，可通过 .env 或环境变量覆盖）
   */
  SERVE_STATIC: process.env.SERVE_STATIC !== undefined ? process.env.SERVE_STATIC === 'true' : true,

  /**
   * API 服务监听端口。
   *
   * 兼容旧变量 `PORT`（`API_PORT` 优先级更高）。
   * @default 5001
   */
  API_PORT: parseInt(process.env.API_PORT || process.env.PORT || '5001', 10),

  /**
   * 允许的 CORS 来源。
   *
   * - 未设置或 `*`：允许所有来源（默认，开发友好）
   * - 多个来源用逗号分隔，如 `"http://localhost:5173,https://example.com"`
   * @default true（允许所有来源）
   */
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS),

  /**
   * 反向代理跳数（Express trust proxy）。
   *
   * 企业理由：部署在 LB/Ingress 之后时须信任 X-Forwarded-For 以正确限流；
   * 直连暴露时应设为 0，防止伪造 XFF 绕过限流。
   * @default 1
   */
  TRUST_PROXY_HOPS: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10),

  /**
   * 计算密集型端点限流上限（次/分钟/IP）。
   * E2E 测试可通过 COMPUTE_RATE_LIMIT_MAX 放宽。
   * @default 10
   */
  COMPUTE_RATE_LIMIT_MAX: parseInt(process.env.COMPUTE_RATE_LIMIT_MAX || '10', 10),

  /**
   * 同步计算端点超时（毫秒）。
   *
   * 企业理由：优化器/网格搜索等 BullMQ 不可用回退同步执行时，
   * 需限制最大执行时间防止长时间占用事件循环。
   * @default 30000（30 秒）
   */
  SYNC_COMPUTE_TIMEOUT_MS: parseInt(process.env.SYNC_COMPUTE_TIMEOUT_MS || '30000', 10),

  /**
   * 应用对外基础 URL（用于构造邮件中的验证 / 邀请链接，ADR-035）。
   * 前端 Vite 开发服务器默认监听 5176 端口（见 vite.config.ts），与此保持一致。
   * @default "http://localhost:5176"
   */
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:5176',

  // ---------------------------------------------------------------------------
  // 文件路径（相对于项目根目录，统一在此计算避免各处硬编码）
  // ---------------------------------------------------------------------------

  /** 项目根目录（package.json 所在目录）。 */
  PROJECT_ROOT,

  /** SQL 迁移文件目录。 */
  MIGRATIONS_DIR: path.resolve(PROJECT_ROOT, 'migrations'),

  /** 前端构建产物目录（Vite 输出）。 */
  FRONTEND_DIST_DIR: path.resolve(PROJECT_ROOT, 'dist'),
};
