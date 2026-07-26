/**
 * 全局请求超时中间件（P3-5）。
 *
 * 企业理由：Express 默认无请求级超时，当 Go 引擎无响应或下游服务挂起时，
 * HTTP 连接被无限占用，最终耗尽连接池导致服务不可用。
 * 此中间件为所有请求设置 30s 上限，超时后返回 503 Problem Detail（RFC 7807）。
 *
 * 设计要点：
 * - 超时时返回 503（Service Unavailable）而非 408（Request Timeout），
 *   因为 503 含 Retry-After 语义，更符合"服务暂时不可用"的实际情况
 * - 使用 `res.on('finish')` 和 `res.on('close')` 清理定时器，防止内存泄漏
 * - 仅在 `!res.headersSent` 时发送响应，避免重复响应
 * - 计算端点可通过路由级覆盖延长超时（或依赖 Go 引擎端点的自身超时）
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/** 默认全局请求超时：30 秒 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 创建请求超时中间件。
 *
 * @param timeoutMs - 超时毫秒数，默认 30000
 * @returns Express 中间件函数
 */
export function requestTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(
          { method: req.method, path: req.path, timeoutMs },
          'Request timeout: request exceeded time limit',
        );
        res.status(503).set('Retry-After', '30').json({
          type: 'https://errors.backtest.io/timeout',
          title: 'Request Timeout',
          status: 503,
          detail: 'Request processing exceeded time limit',
        });
      }
    }, timeoutMs);

    // 请求完成（正常或错误）时清除定时器，防止内存泄漏
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}
