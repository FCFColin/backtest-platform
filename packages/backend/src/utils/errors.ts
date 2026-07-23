/**
 * RFC 7807 Problem Details 统一错误响应 + 类型化错误层级
 *
 * 企业理由：路由层此前三种错误格式混用（字符串匹配/{code,message}/自由文本），
 * 前端需处理多种格式。RFC 7807 是 HTTP API 错误标准。
 *
 * P0 统一错误处理：引入 ApplicationError 类层级，消除路由层字符串匹配错误的反模式。
 * 应用服务抛出类型化错误，路由层统一处理器自动翻译为 HTTP 状态码。
 */
import type { Response } from 'express';

/** sendProblem 的可选扩展项 */
export interface SendProblemOptions {
  /** 详细错误描述 */
  detail?: string;
  /** 额外响应头（如 Retry-After），用于 fail-closed 降级（ADR-031） */
  headers?: Record<string, string>;
  /** 降级标记，为 true 时在响应体中包含 degraded: true（ADR-031） */
  degraded?: boolean;
  /** 降级原因说明，前端 apiClient 读取此字段展示 Toast（ADR-031） */
  degradedWarning?: string;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// 类型化错误层级 — 替代路由层字符串匹配
// ---------------------------------------------------------------------------

/**
 * 应用层错误基类。
 *
 * 所有应用服务抛出的业务错误应继承此类，
 * 路由层通过 asyncRouteHandler 统一捕获并翻译为 HTTP 响应。
 */
export abstract class ApplicationError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  abstract readonly errorTitle: string;
}

/**
 * 验证错误（422 Unprocessable Entity）。
 *
 * 用于参数校验失败、标的无效、数据不足等客户端可修正的错误。
 */
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

/**
 * 数据未找到错误（404 Not Found）。
 *
 * 用于请求的数据（价格序列、标的信息等）不存在时的错误。
 */
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
 * 上游服务 4xx 错误（RO-045 / RFC 7807 透传）。
 *
 * 企业理由：Go 引擎对参数错误返回 4xx（如 400 Bad Request / 422 Unprocessable），
 * 此前 httpClient 在 !resp.ok 时统一返回 null，engineClient 包装为 EngineUnavailableError → 503，
 * 使客户端无法区分"引擎宕机"与"参数错误"。本错误携带上游原始 status/code/title/detail，
 * 由 callEngineStrict 透传给路由层，路由用 sendProblem 返回原始 4xx 状态码。
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

/**
 * 发送 RFC 7807 Problem Details JSON 错误响应
 *
 * @param res Express Response 对象
 * @param status HTTP 状态码
 * @param code 应用特定错误码
 * @param title 人类可读标题
 * @param options 可选扩展项（detail 详细描述、headers 额外响应头）
 */
export function sendProblem(
  res: Response,
  status: number,
  code: string,
  title?: string,
  options?: SendProblemOptions,
): void {
  const { detail, headers, degraded, degradedWarning } = options ?? {};
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
  if (degraded !== undefined) {
    body.degraded = degraded;
  }
  if (degradedWarning !== undefined) {
    body.degradedWarning = degradedWarning;
  }
  r.json(body);
}

/** 应用错误码枚举 — 用于前端i18n映射 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TICKER_NOT_FOUND: 'TICKER_NOT_FOUND',
  TICKER_DATA_INSUFFICIENT: 'TICKER_DATA_INSUFFICIENT',
  INVALID_WEIGHT_SUM: 'INVALID_WEIGHT_SUM',
  EMPTY_PORTFOLIO: 'EMPTY_PORTFOLIO',
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
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
