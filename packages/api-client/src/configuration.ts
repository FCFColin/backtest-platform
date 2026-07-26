/**
 * Configuration — SDK 客户端配置
 *
 * 持有 basePath（与 OpenAPI `servers` 中的 URL 对齐）、可选的 JWT
 * accessToken 与组织级 apiKey。所有 API 包装类都接受一个
 * Configuration 实例，便于在多环境间复用。
 */

export interface ConfigurationOptions {
  /**
   * API 基地址，默认与 OpenAPI spec 中的本地开发服务器一致：
   * `http://localhost:5001/api/v1`。结尾的 `/` 会被自动去除。
   */
  basePath?: string;
  /** 组织级 API Key（过渡兼容，发送到 `x-api-key` 请求头） */
  apiKey?: string;
  /** JWT 访问令牌（发送到 `Authorization: Bearer <token>` 请求头） */
  accessToken?: string;
}

export class Configuration {
  basePath: string;
  apiKey?: string;
  accessToken?: string;

  constructor(options: ConfigurationOptions = {}) {
    this.basePath = (options.basePath ?? 'http://localhost:5001/api/v1').replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.accessToken = options.accessToken;
  }
}
