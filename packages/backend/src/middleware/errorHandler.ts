import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  const userId = (req as { user?: { sub?: string } }).user?.sub;
  logger.error(
    { err: error, requestId: req.id, method: req.method, path: req.path, ip: req.ip, userId },
    '[Server Error]',
  );
  sendProblem(res, 500, 'INTERNAL_ERROR', 'Internal Server Error', {
    detail:
      config.NODE_ENV === 'development'
        ? String(error.message).substring(0, 200)
        : 'An internal server error occurred',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.info({ method: req.method, path: req.path }, '[app] 404 未匹配路由');
  sendProblem(res, 404, 'NOT_FOUND', 'Not Found', {
    detail: `The requested ${req.method} resource was not found`,
  });
}
