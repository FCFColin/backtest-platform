/**
 * 引擎与数据服务配置片段。
 *
 * 涵盖 Go 引擎（回测/MC/优化）与 Go 数据服务（行情/baostock）的地址、超时及服务间认证 token。
 */

/** 引擎与数据服务配置片段（ADR-008 / ADR-031）。 */
export const engineConfig = {
  /** Go 引擎服务地址（唯一回测引擎，ADR-008 / ADR-031），不可用时 fail-closed 返回 503。@default "http://127.0.0.1:5004" */
  GO_ENGINE_URL: process.env.GO_ENGINE_URL || 'http://127.0.0.1:5004',

  ENGINE_TIMEOUT_MS: parseInt(process.env.ENGINE_TIMEOUT_MS || '5000', 10),

  /** Go 数据服务地址（主数据源），不可用时降级到 PostgreSQL。@default "http://127.0.0.1:5003" */
  GO_DATA_SERVICE_URL: process.env.GO_DATA_SERVICE_URL || 'http://127.0.0.1:5003',

  /** Go 数据服务 HTTP 请求超时（毫秒），短超时确保开发环境快速失败。@default 5000（5 秒） */
  GO_DATA_SERVICE_TIMEOUT_MS: parseInt(process.env.GO_DATA_SERVICE_TIMEOUT_MS || '5000', 10),

  /** Go 引擎认证 token（X-Engine-Auth 头），须与 engine-go 的 ENGINE_AUTH_TOKEN 一致。@default "dev-engine-auth-token" */
  ENGINE_AUTH_TOKEN: process.env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token',

  /** Go 数据服务认证 token（X-Data-Service-Auth 头），须与 data-fetcher 的 DATA_SERVICE_AUTH_TOKEN 一致。@default "dev-data-service-auth-token" */
  DATA_SERVICE_AUTH_TOKEN: process.env.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token',
};
