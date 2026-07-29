/**
 * 全局请求超时中间件（P3-5）。
 *
 * 企业理由：Express 默认无请求级超时，当 Go 引擎无响应或下游服务挂起时，
 * HTTP 连接被无限占用，最终耗尽连接池导致服务不可用。
 * 此中间件为所有请求设置 30s 上限，超时后返回 408 RFC 7807 Problem Details。
 *
 * 设计要点：
 * - 超时时返回 408（Request Timeout）+ RFC 7807 格式（success/error 包装），
 *   经 sendProblem 统一输出，与全平台错误格式一致（P2-4 / D4-003）
 * - 使用 `res.on('finish')` 和 `res.on('close')` 清理定时器，防止内存泄漏
 * - 仅在 `!res.headersSent` 时发送响应，避免重复响应
 * - 计算端点可通过路由级覆盖延长超时（或依赖 Go 引擎端点的自身超时）
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';

/** 默认全局请求超时：30 秒 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Retry-After 头值（秒），与 DEFAULT_TIMEOUT_MS 对齐 */
const TIMEOUT_RETRY_AFTER_SECONDS = '30';

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
        sendProblem(res, 408, 'REQUEST_TIMEOUT', 'Request Timeout', {
          detail: 'Request processing exceeded time limit',
          headers: { 'Retry-After': TIMEOUT_RETRY_AFTER_SECONDS },
        });
      }
    }, timeoutMs);

    // 请求完成（正常或错误）时清除定时器，防止内存泄漏
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}