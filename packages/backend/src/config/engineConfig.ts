/**
 * 引擎与数据服务配置片段。
 *
 * 涵盖 Go 引擎（回测/MC/优化）与 Go 数据服务（行情/baostock）的地址、超时及服务间认证 token。
 */

/**
 * 引擎与数据服务配置片段（ADR-008 / ADR-031）。
 */
export const engineConfig = {
  /**
   * Go 引擎服务地址（唯一回测引擎，ADR-008 / ADR-031）。
   *
   * 企业理由（ADR-008）：Go 引擎是平台唯一的回测/分析/优化/蒙特卡洛引擎，
   * Go 服务默认监听 5004（见 engine-go/cmd/server/main.go 与 tests/helpers/constants.ts）。
   * 此前默认值误写为 5002（Rust 引擎端口），导致 Go 引擎调用始终失败并静默降级到 Node，
   * 现统一为 5004，消除端口矛盾。
   * Go 在并发模型（goroutine vs async）、开发效率和生态上优于 Rust。
   * 不可用时按 fail-closed 策略返回 503/重试（ADR-031），不再静默返回 Node 计算结果。
   * @default "http://127.0.0.1:5004"
   */
  GO_ENGINE_URL: process.env.GO_ENGINE_URL || 'http://127.0.0.1:5004',

  ENGINE_TIMEOUT_MS: parseInt(process.env.ENGINE_TIMEOUT_MS || '5000', 10),

  /**
   * Go 数据服务地址（主数据源）。
   *
   * 不可用时降级到 PostgreSQL（Go 服务不可用时由 API 直接查库）。
   * @default "http://127.0.0.1:5003"
   */
  GO_DATA_SERVICE_URL: process.env.GO_DATA_SERVICE_URL || 'http://127.0.0.1:5003',

  /**
   * Go 数据服务 HTTP 请求超时（毫秒）。
   *
   * 开发环境 data-fetcher 可能未启动，短超时确保快速失败而非等待 30s。
   * 生产环境 data-fetcher 通常 <1s 响应，5s 留有余量。
   * @default 5000（5 秒）
   */
  GO_DATA_SERVICE_TIMEOUT_MS: parseInt(process.env.GO_DATA_SERVICE_TIMEOUT_MS || '5000', 10),

  /**
   * Go 引擎认证 token（X-Engine-Auth 请求头）。
   *
   * 企业理由：engine-go 暴露计算密集型 API，无认证时任意调用方可消耗 CPU 资源引发 DoS。
   * API 服务调用 engine-go 时通过此 token 进行服务间认证。
   * 必须与 engine-go 服务的 ENGINE_AUTH_TOKEN 环境变量保持一致。
   * 生产环境必须设置为强随机值（>= 32 字符），禁止使用默认 dev 值。
   * @default "dev-engine-auth-token"
   */
  ENGINE_AUTH_TOKEN: process.env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token',

  /**
   * Go 数据服务认证 token（X-Data-Service-Auth 请求头）。
   *
   * 企业理由：data-fetcher 暴露行情数据和 baostock 实时查询 API，
   * 无认证时任意调用方可消耗外部 API 配额和磁盘 I/O 资源。
   * API 服务调用 data-fetcher 时通过此 token 进行服务间认证。
   * 必须与 data-fetcher 服务的 DATA_SERVICE_AUTH_TOKEN 环境变量保持一致。
   * 生产环境必须设置为强随机值（>= 32 字符），禁止使用默认 dev 值。
   * @default "dev-data-service-auth-token"
   */
  DATA_SERVICE_AUTH_TOKEN: process.env.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token',
};
