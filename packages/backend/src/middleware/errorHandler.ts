import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { ApplicationError, sendProblem } from '../utils/errors.js';
import { translateToProblem } from '../utils/errorMapper.js';

function isBodyParserError(error: Error): error is Error & { status: number } {
  return (error as { type?: string }).type?.startsWith('entity.') === true;
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  const userId = (req as { user?: { sub?: string } }).user?.sub;
  const log = {
    err: error,
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId,
  };
  // 客户端入参错误（4xx ApplicationError）属预期路径，降级 warn 避免与真实服务故障混淆
  const clientError = error instanceof ApplicationError && error.statusCode < 500;
  if (clientError) logger.warn(log, '[Request Error]');
  else logger.error(log, '[Server Error]');
  if (translateToProblem(res, error)) return;
  if (isBodyParserError(error)) {
    const status = error.status === 413 ? 413 : 400;
    sendProblem(res, status, status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON');
    return;
  }
  sendProblem(res, 500, 'INTERNAL_ERROR');
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.debug({ method: req.method, path: req.path }, '[app] 404 未匹配路由');
  sendProblem(res, 404, 'NOT_FOUND');
}

const DEFAULT_TIMEOUT_MS = 30_000;
const TIMEOUT_RETRY_AFTER_SECONDS = '30';

export function requestTimeout(
  timeoutMs: number | ((req: Request) => number) = DEFAULT_TIMEOUT_MS,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resolved = typeof timeoutMs === 'function' ? timeoutMs(req) : timeoutMs;
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(
          { method: req.method, path: req.path, timeoutMs: resolved },
          'Request timeout: request exceeded time limit',
        );
        sendProblem(res, 408, 'REQUEST_TIMEOUT', 'Request Timeout', {
          detail: 'Request processing exceeded time limit',
          headers: { 'Retry-After': TIMEOUT_RETRY_AFTER_SECONDS },
        });
      }
    }, resolved);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}
