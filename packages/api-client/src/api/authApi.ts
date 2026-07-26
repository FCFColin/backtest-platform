/**
 * AuthApi — 认证相关接口包装
 *
 * 注意：登录返回的 accessToken 应通过 `Configuration.accessToken` 或
 * `BaseApiClient.setAccessToken` 注入到后续需要 JWT 鉴权的请求中。
 */

import { BaseApiClient } from '../client.js';
import { Configuration } from '../configuration.js';
import type { ApiResponse, AuthTokens, UserProfile } from '../types.js';

export class AuthApi extends BaseApiClient {
  constructor(config: Configuration = new Configuration()) {
    super({
      basePath: config.basePath,
      apiKey: config.apiKey,
      accessToken: config.accessToken,
    });
  }

  /**
   * POST /api/v1/auth/login — 用户名密码登录
   *
   * @returns accessToken + refreshToken
   */
  async login(username: string, password: string): Promise<AuthTokens> {
    const res = await this.request<ApiResponse<AuthTokens>>('POST', '/auth/login', {
      username,
      password,
    });
    return res.data as AuthTokens;
  }

  /**
   * POST /api/v1/auth/refresh — 刷新访问令牌
   *
   * @param refreshToken - 当前持有的 refresh token
   * @returns 新的 accessToken + refreshToken
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const res = await this.request<ApiResponse<AuthTokens>>('POST', '/auth/refresh', {
      refreshToken,
    });
    return res.data as AuthTokens;
  }

  /**
   * GET /api/v1/auth/me — 查询当前用户身份
   *
   * 需携带有效 accessToken。
   * @returns 当前用户资料
   */
  async getProfile(): Promise<UserProfile> {
    const res = await this.request<ApiResponse<UserProfile>>('GET', '/auth/me');
    return res.data as UserProfile;
  }
}
