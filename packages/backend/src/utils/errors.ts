/**
 * RFC 7807 Problem Details 统一错误响应 + 类型化错误层级。
 * P0 统一错误处理：引入 ApplicationError 类层级，消除路由层字符串匹配错误的反模式。
 */
import type { Response } from 'express';

export interface SendProblemOptions {
  detail?: string;
  /** 用于引擎 fail-closed 503（ADR-031） */
  headers?: Record<string, string>;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export abstract class ApplicationError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  abstract readonly errorTitle: string;
}

export class ValidationError extends ApplicationError {
  readonly statusCode = 422;
  readonly errorCode: string;
  readonly errorTitle: string;
  constructor(
    message: string,
    code: string = 'VALIDATION_ERROR',
    title: string = 'Validation failed',
  ) {
    super(message);
    this.name = 'ValidationError';
    this.errorCode = code;
    this.errorTitle = title;
  }
}

export class DataNotFoundError extends ApplicationError {
  readonly statusCode = 404;
  readonly errorCode = 'DATA_NOT_FOUND';
  readonly errorTitle = 'Data not found';
  constructor(message: string) {
    super(message);
    this.name = 'DataNotFoundError';
  }
}

/**
 * Redis 不可用错误（503，ADR-045）。
 * HA（Sentinel）架构下静默降级比显式失败更危险：跨 Pod 状态不一致会导致
 * 刷新令牌无法验证、幂等键失效、暴力破解防护失效。asyncRouteHandler /
 * crudRouteHandler 自动翻译为 503 + RFC 7807 响应体。
 */
export class RedisUnavailableError extends ApplicationError {
  readonly statusCode = 503;
  readonly errorCode = 'REDIS_UNAVAILABLE';
  readonly errorTitle = 'Redis unavailable';
  constructor(message: string = 'Redis unavailable') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

/**
 * 上游服务 4xx 错误（RFC 7807 透传）。
 *
 * Go 引擎对参数错误返回 4xx，httpClient 此前在 !resp.ok 时统一返回 null，
 * engineClient 包装为 EngineUnavailableError → 503，使客户端无法区分"引擎宕机"
 * 与"参数错误"。本错误携带上游原始 status/code/title/detail，由 callEngineStrict
 * 透传给路由层。
 *
 * 与 EngineUnavailableError 的边界（ADR-031 细化）：
 * - 4xx（客户端错误）→ UpstreamProblemError，透传原始状态码（不重试、不 fail-closed）
 * - 5xx / 网络错误（服务不可用）→ EngineUnavailableError → 503 + Retry-After（fail-closed）
 */
export class UpstreamProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  constructor(status: number, code: string, title: string, detail: string) {
    super(detail || title);
    this.name = 'UpstreamProblemError';
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
  }
}

export function sendProblem(
  res: Response,
  status: number,
  code: string,
  title?: string,
  options?: SendProblemOptions,
): void {
  const { detail, headers } = options ?? {};
  const r = res.status(status).header('Content-Type', 'application/problem+json');
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      r.header(key, value);
    }
  }
  const body: Record<string, unknown> = {
    success: false,
    error: {
      type: `https://backtest.platform/errors/${code}`,
      title: title ?? code,
      status,
      code,
      detail,
      instance: res.req?.path,
    },
  };
  r.json(body);
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TICKER_NOT_FOUND: 'TICKER_NOT_FOUND',
  TICKER_DATA_INSUFFICIENT: 'TICKER_DATA_INSUFFICIENT',
  INVALID_WEIGHT_SUM: 'INVALID_WEIGHT_SUM',
  EMPTY_PORTFOLIO: 'EMPTY_PORTFOLIO',
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  REDIS_UNAVAILABLE: 'REDIS_UNAVAILABLE',
  DATA_FETCH_FAILED: 'DATA_FETCH_FAILED',
  DATA_DEGRADED: 'DATA_DEGRADED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BACKTEST_ERROR: 'BACKTEST_ERROR',
  INVALID_TICKER: 'INVALID_TICKER',
  MISSING_PARAMS: 'MISSING_PARAMS',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];