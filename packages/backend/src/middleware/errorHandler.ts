import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { translateToProblem } from '../utils/errorMapper.js';

// body-parser 抛出的实体错误带 status 与 type（entity.too.large/entity.parse.failed），其余未知错误一律 500
function isBodyParserError(error: Error): error is Error & { status: number } {
  return (error as { type?: string }).type?.startsWith('entity.') === true;
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  const userId = (req as { user?: { sub?: string } }).user?.sub;
  logger.error(
    { err: error, requestId: req.id, method: req.method, path: req.path, ip: req.ip, userId },
    '[Server Error]',
  );
  if (translateToProblem(res, error)) return;
  if (isBodyParserError(error)) {
    // 413 Payload Too Large / 400 JSON 语法错误：映射到客户端错误而非 500
    const status = error.status === 413 ? 413 : 400;
    sendProblem(res, status, status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON');
    return;
  }
  sendProblem(res, 500, 'INTERNAL_ERROR');
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.info({ method: req.method, path: req.path }, '[app] 404 未匹配路由');
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
