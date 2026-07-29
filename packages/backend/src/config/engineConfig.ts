/**
 * 引擎与数据服务配置片段。
 *
 * 涵盖 Go 引擎（回测/MC/优化）与 Go 数据服务（行情/baostock）的地址、超时及服务间认证 token。
 */

import { requireSecret } from './env.js';

/** 引擎与数据服务配置片段（ADR-008 / ADR-031）。 */
export const engineConfig = {
  /** Go 引擎服务地址（唯一回测引擎，ADR-008 / ADR-031），不可用时 fail-closed 返回 503。@default "http://127.0.0.1:15004" */
  GO_ENGINE_URL: process.env.GO_ENGINE_URL || 'http://127.0.0.1:15004',

  /**
   * Go 引擎 HTTP 请求超时（毫秒）。
   *
   * 企业理由（C-020）：Go 引擎内部 computeTimeout=90s（router.go），
   * Node 端超时须大于 90s 以避免复杂回测在引擎仍在计算时被 Node 端提前断连（fail-closed 503）。
   * 设为 120s（与 BACKTEST_SYNC_TIMEOUT_MS 一致）：90s 计算 + 30s 余量给响应序列化与网络写出。
   * 兼容旧变量名 RUST_ENGINE_TIMEOUT_MS。@default 120000（120 秒）
   */
  ENGINE_TIMEOUT_MS: parseInt(process.env.ENGINE_TIMEOUT_MS || '120000', 10),

  /** Go 数据服务地址（主数据源），不可用时降级到 PostgreSQL。@default "http://127.0.0.1:15003" */
  GO_DATA_SERVICE_URL: process.env.GO_DATA_SERVICE_URL || 'http://127.0.0.1:15003',

  /** Go 数据服务 HTTP 请求超时（毫秒），短超时确保开发环境快速失败。@default 5000（5 秒） */
  GO_DATA_SERVICE_TIMEOUT_MS: parseInt(process.env.GO_DATA_SERVICE_TIMEOUT_MS || '5000', 10),

  /** Go 引擎认证 token（X-Engine-Auth 头），须与 engine-go 的 ENGINE_AUTH_TOKEN 一致。@default "dev-engine-auth-token" */
  ENGINE_AUTH_TOKEN: requireSecret('ENGINE_AUTH_TOKEN'),

  /** Go 数据服务认证 token（X-Data-Service-Auth 头），须与 data-fetcher 的 DATA_SERVICE_AUTH_TOKEN 一致。@default "dev-data-service-auth-token" */
  DATA_SERVICE_AUTH_TOKEN: requireSecret('DATA_SERVICE_AUTH_TOKEN'),
};
