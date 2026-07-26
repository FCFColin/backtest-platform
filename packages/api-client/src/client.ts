/**
 * BaseApiClient — 手写的轻量级 fetch 封装（占位实现）
 *
 * 在 openapi-generator-cli 暂未运行的环境下，作为 SDK 的底层传输层。
 * 负责：
 * - 拼接 basePath + path 与 query string
 * - 注入鉴权头（JWT Bearer / 组织级 API Key）
 * - JSON 请求体序列化与响应体反序列化
 * - 非 2xx 响应统一抛出 BacktestApiError
 *
 * 后续切换到 openapi-generator 生成的 typescript-fetch 客户端时，
 * API 包装类可改为委托给生成的 FetchAPI，对外接口保持不变。
 */

import { BacktestApiError } from './errors.js';

export interface BaseApiClientOptions {
  /** API 基地址（已含 `/api/v1` 前缀），结尾 `/` 会被去除 */
  basePath: string;
  /** 组织级 API Key，发送到 `x-api-key` 请求头 */
  apiKey?: string;
  /** JWT 访问令牌，发送到 `Authorization: Bearer <token>` 请求头 */
  accessToken?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | Array<string | number | boolean> | undefined;

export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
}

export class BaseApiClient {
  protected readonly basePath: string;
  protected apiKey?: string;
  protected accessToken?: string;

  constructor(options: BaseApiClientOptions) {
    if (!options.basePath) {
      throw new Error('BaseApiClient: basePath is required');
    }
    this.basePath = options.basePath.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.accessToken = options.accessToken;
  }

  /** 更新访问令牌（刷新后调用） */
  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
  }

  /** 更新组织级 API Key */
  setApiKey(key: string | undefined): void {
    this.apiKey = key;
  }

  /** 拼接完整 URL：basePath + path + query string */
  protected buildUrl(path: string, query?: QueryParams): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.basePath}${normalizedPath}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, String(item));
      } else {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    return qs.length > 0 ? `${url}?${qs}` : url;
  }

  /** 构建请求头：合并自定义头 + 鉴权头 */
  protected buildHeaders(extra?: Record<string, string>): Headers {
    const headers = new Headers(extra);
    if (this.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    if (this.apiKey && !headers.has('x-api-key')) {
      headers.set('x-api-key', this.apiKey);
    }
    return headers;
  }

  /**
   * 发起 HTTP 请求并解析响应。
   *
   * @typeParam T - 期望的响应体类型
   * @param method - HTTP 方法
   * @param path - 相对 basePath 的路径（如 `/backtest/portfolio`）
   * @param body - 请求体对象，会被 JSON.stringify
   * @param query - 查询参数
   * @param headers - 额外请求头
   * @returns 解析后的 JSON 响应体
   * @throws {BacktestApiError} 非 2xx 响应或网络层故障
   */
  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: QueryParams,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const reqHeaders = this.buildHeaders(headers);

    let reqBody: BodyInit | undefined;
    if (body !== undefined && body !== null) {
      if (!reqHeaders.has('Content-Type')) {
        reqHeaders.set('Content-Type', 'application/json');
      }
      reqBody = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await globalThis.fetch(url, {
        method,
        headers: reqHeaders,
        body: reqBody,
      });
    } catch (err) {
      throw new BacktestApiError({
        status: 0,
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        body: undefined,
      });
    }

    return this.parseResponse<T>(response);
  }

  /** 解析响应体：JSON 优先，非 2xx 抛 BacktestApiError */
  protected async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') ?? '';
    let parsed: unknown;
    if (response.status === 204) {
      parsed = null;
    } else if (contentType.includes('application/json')) {
      parsed = await response.json();
    } else {
      const text = await response.text();
      parsed = text.length > 0 ? safeJsonParse(text) : null;
    }

    if (!response.ok) {
      throw new BacktestApiError({
        status: response.status,
        statusText: response.statusText,
        body: parsed,
      });
    }
    return parsed as T;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
