/** RFC 7807 Problem Details 统一错误响应 + 类型化错误层级。 */
import type { Response } from 'express';

interface SendProblemOptions {
  detail?: string;
  /** 用于引擎 fail-closed 503（ADR-008） */
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

/** Redis 不可用（503，DADR-045）。HA 下静默降级比显式失败更危险。 */
export class RedisUnavailableError extends ApplicationError {
  readonly statusCode = 503;
  readonly errorCode = 'REDIS_UNAVAILABLE';
  readonly errorTitle = 'Redis unavailable';
  constructor(message: string = 'Redis unavailable') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

/** Stripe 未配置对应 plan 的 price（503，计费配置缺失）。 */
export class BillingNotConfiguredError extends ApplicationError {
  readonly statusCode = 503;
  readonly errorCode = 'PRICE_NOT_CONFIGURED';
  readonly errorTitle = 'Billing not configured';
  constructor(message: string) {
    super(message);
    this.name = 'BillingNotConfiguredError';
  }
}

/** 组织尚未建立 Stripe 客户（404）。 */
export class NoStripeCustomerError extends ApplicationError {
  readonly statusCode = 404;
  readonly errorCode = 'NO_CUSTOMER';
  readonly errorTitle = 'No billing customer';
}

/** 上游 4xx 透传（ADR-008：4xx 参数错误不降级为 503 fail-closed）。 */
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
  if (res.headersSent) return; // 防 double-send：超时/上游已写响应后重复写会抛 ERR_HTTP_HEADERS_SENT → 进程退出
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
