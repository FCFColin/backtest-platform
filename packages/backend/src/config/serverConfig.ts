/**
 * 服务器与基础配置片段。
 *
 * 涵盖运行环境、静态资源服务、端口、CORS、反向代理、限流、应用基础 URL 及文件路径。
 */

import path from 'path';
import { parseCorsOrigins, PROJECT_ROOT, type NodeEnv } from './env.js';

/** 服务器与基础配置片段。 */
export const serverConfig = {
  /** 当前运行环境：development（默认）/ production / test。 */
  NODE_ENV: (process.env.NODE_ENV || 'development') as NodeEnv,

  /** 是否托管前端 dist/ 静态资源，开发默认 true 可通过 SERVE_STATIC=false 关闭。@default true */
  SERVE_STATIC: process.env.SERVE_STATIC !== undefined ? process.env.SERVE_STATIC === 'true' : true,

  /** API 服务监听端口（兼容旧变量 PORT，API_PORT 优先）。@default 5001 */
  API_PORT: parseInt(process.env.API_PORT || process.env.PORT || '5001', 10),

  /** 允许的 CORS 来源，未设置或 `*` 允许所有，多个用逗号分隔。@default true（允许所有来源） */
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS),

  /** 反向代理跳数（Express trust proxy），直连暴露时应设为 0 防止伪造 XFF。@default 1 */
  TRUST_PROXY_HOPS: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10),

  /** 计算密集型端点限流上限（次/分钟/IP）。@default 10 */
  COMPUTE_RATE_LIMIT_MAX: parseInt(process.env.COMPUTE_RATE_LIMIT_MAX || '10', 10),

  /** 同步计算端点超时（毫秒），防止长任务占用事件循环。@default 30000（30 秒） */
  SYNC_COMPUTE_TIMEOUT_MS: parseInt(process.env.SYNC_COMPUTE_TIMEOUT_MS || '30000', 10),

  /** 应用对外基础 URL（用于邮件验证/邀请链接，ADR-035）。@default "http://localhost:5176" */
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

  // ---------------------------------------------------------------------------
  // 可观测性配置（从 observabilityConfig.ts 合并）
  // ---------------------------------------------------------------------------

  /** OTLP traces 导出端点。未配置时走 stdout exporter。 */
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',

  /** OTLP metrics 独立导出端点。未配置时走 prom-client 拉取模型。 */
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || '',
};
