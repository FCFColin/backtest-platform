/**
 * 管理端点鉴权中间件
 *
 * 通过校验请求头 `x-api-key` 与服务端配置的 `ADMIN_API_KEY` 是否一致，
 * 保护管理类接口（`/api/admin/*`、`/api/data/manage/*`）不被未授权访问。
 *
 * 鉴权策略：
 * - 开发环境（NODE_ENV !== 'production'）且未配置 ADMIN_API_KEY 时跳过鉴权，方便本地开发
 * - 缺失 API Key：返回 401
 * - API Key 错误：返回 403
 * - API Key 正确：调用 next() 放行
 *
 * 企业理由：API 端点认证是安全底线，防止未授权调用消耗计算资源。
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * 校验请求头 `x-api-key` 的管理端点鉴权中间件。
 *
 * @param req - Express 请求对象
 * @param res - Express 响应对象
 * @param next - Express next 函数
 */
export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  logger.info({ middleware: 'requireApiKey', path: req.path, method: req.method, requestId: (req as any).id }, '[auth] API Key 认证检查');

  // 开发环境且未配置 ADMIN_API_KEY 时跳过鉴权，方便本地开发
  if (!config.ADMIN_API_KEY) {
    if (config.NODE_ENV !== 'production') {
      logger.warn('[auth] 开发环境未配置 ADMIN_API_KEY，鉴权已跳过，请勿在生产环境使用');
      next();
      return;
    }
    // 生产环境未配置 ADMIN_API_KEY，直接拒绝
    res.status(401).json({ success: false, error: { code: 'MISSING_API_KEY', message: 'Missing API key' } });
    return;
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;

  // 缺失 API Key
  if (!apiKey) {
    logger.warn({ middleware: 'requireApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 缺失');
    res.status(401).json({ success: false, error: { code: 'MISSING_API_KEY', message: 'Missing API key' } });
    return;
  }

  // API Key 长度校验（防止 DoS）
  if (apiKey.length > 128) {
    logger.warn({ middleware: 'requireApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 无效');
    res.status(403).json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
    return;
  }

  // 使用常量时间比较防止时序攻击
  const expected = config.ADMIN_API_KEY;
  if (apiKey.length !== expected.length) {
    logger.warn({ middleware: 'requireApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 无效');
    res.status(403).json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
    return;
  }
  const a = Buffer.from(apiKey, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (!crypto.timingSafeEqual(a, b)) {
    logger.warn({ middleware: 'requireApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 无效');
    res.status(403).json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
    return;
  }

  logger.info({ middleware: 'requireApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 认证通过');
  next();
}

/**
 * 可选 API Key 认证中间件
 *
 * 企业理由：计算密集型端点（如 /api/backtest/*）需要认证保护，
 * 但不能强制要求（否则破坏现有前端调用）。
 * optionalApiKey 策略：
 * - 有 API Key 时验证身份并记录
 * - 无 API Key 时放行但记录匿名访问
 * 生产环境可通过 REQUIRE_API_KEY=true 强制要求认证。
 * 权衡：可选认证比无认证好，但不如强制认证安全。
 * 渐进式引入，避免破坏现有调用方。
 */
// Security: optionalApiKey仅用于开发环境便利性
// 企业为何需要：生产环境必须使用requireApiKey，否则计算端点可被匿名调用
// 权衡：开发环境无API Key时仍可访问，提升开发体验
export function optionalApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  logger.info({ middleware: 'optionalApiKey', path: req.path, method: req.method, requestId: (req as any).id }, '[auth] 可选 API Key 检查');

  // 如果配置了强制认证，退化为 requireApiKey
  if (config.REQUIRE_API_KEY) {
    requireApiKey(req, res, next);
    return;
  }

  // 未配置 ADMIN_API_KEY 时直接放行
  if (!config.ADMIN_API_KEY) {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;

  // 无 API Key 时放行（可选认证）
  if (!apiKey) {
    logger.info({ middleware: 'optionalApiKey', path: req.path, requestId: (req as any).id }, '[auth] 无 API Key，匿名放行');
    next();
    return;
  }

  // 有 API Key 时验证
  if (apiKey.length > 128) {
    // Key 格式异常，但可选认证下不阻断，仅记录
    logger.warn({ middleware: 'optionalApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 验证失败，可选认证放行');
    next();
    return;
  }

  const expected = config.ADMIN_API_KEY;
  if (apiKey.length !== expected.length) {
    logger.warn({ middleware: 'optionalApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 验证失败，可选认证放行');
    next();
    return;
  }
  const a = Buffer.from(apiKey, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (!crypto.timingSafeEqual(a, b)) {
    logger.warn({ middleware: 'optionalApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 验证失败，可选认证放行');
    next();
    return;
  }

  // 验证通过，标记为已认证
  logger.info({ middleware: 'optionalApiKey', path: req.path, requestId: (req as any).id }, '[auth] API Key 验证通过');
  next();
}
