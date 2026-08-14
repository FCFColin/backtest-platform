import type { Response } from 'express';
import { sendProblem, UpstreamProblemError, ApplicationError } from './errors.js';
import { EngineUnavailableError } from './engineClient.js';
import { TimeoutError } from './misc.js';

// 全仓库唯一错误→RFC 7807 响应映射表：routeUtils 与 errorHandler 共用，杜绝多轨翻译。
// EngineUnavailableError→503+Retry-After（ADR-008）、UpstreamProblemError→4xx 透传、TimeoutError→503 COMPUTE_TIMEOUT。
export function translateToProblem(res: Response, error: unknown): boolean {
  if (error instanceof EngineUnavailableError) {
    sendProblem(res, 503, 'ENGINE_UNAVAILABLE', undefined, {
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    });
    return true;
  }
  if (error instanceof UpstreamProblemError) {
    sendProblem(res, error.status, error.code);
    return true;
  }
  if (error instanceof ApplicationError) {
    sendProblem(res, error.statusCode, error.errorCode, error.errorTitle, {
      detail: error.message,
    });
    return true;
  }
  if (error instanceof TimeoutError) {
    sendProblem(res, 503, 'COMPUTE_TIMEOUT');
    return true;
  }
  return false;
}
