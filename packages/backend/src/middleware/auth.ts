import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

function isValidApiKey(apiKey: string): boolean {
  const expected = config.ADMIN_API_KEY;
  if (!expected) return false;
  if (apiKey.length > 128) return false;
  if (apiKey.length !== expected.length) return false;
  const a = Buffer.from(apiKey, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return crypto.timingSafeEqual(a, b);
}

function createApiKeyAuth(isStrict: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let strict = isStrict;
    if (!config.ADMIN_API_KEY) {
      if (strict && config.NODE_ENV === 'production') {
        res
          .status(401)
          .json({ success: false, error: { code: 'MISSING_API_KEY', message: 'Missing API key' } });
        return;
      }
      if (strict) logger.warn('[auth] 开发环境未配置 ADMIN_API_KEY，鉴权已跳过');
      next();
      return;
    }

    if (config.REQUIRE_API_KEY && !strict) {
      strict = true;
    }

    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      if (strict) {
        logger.warn(
          { middleware: 'apiKeyAuth', path: req.path, requestId: req.id },
          '[auth] API Key 缺失',
        );
        res
          .status(401)
          .json({ success: false, error: { code: 'MISSING_API_KEY', message: 'Missing API key' } });
        return;
      }
      logger.info(
        { middleware: 'apiKeyAuth', path: req.path, requestId: req.id },
        '[auth] 无 API Key，匿名放行',
      );
      next();
      return;
    }

    if (!isValidApiKey(apiKey)) {
      logger.warn(
        { middleware: 'apiKeyAuth', path: req.path, requestId: req.id },
        '[auth] API Key 无效',
      );
      if (strict) {
        res
          .status(403)
          .json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
        return;
      }
      next();
      return;
    }

    logger.info(
      { middleware: 'apiKeyAuth', path: req.path, requestId: req.id },
      '[auth] API Key 验证通过',
    );
    next();
  };
}

export const requireApiKey = createApiKeyAuth(true);
export const optionalApiKey = createApiKeyAuth(false);
