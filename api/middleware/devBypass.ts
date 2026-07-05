/**
 * 开发环境认证旁路中间件
 *
 * 企业理由：开发环境跳过认证，方便本地调试，但需确保生产环境不会误配。
 */

import type { NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  type AuthenticatedRequest,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  attachAuthLogContext,
} from './authTypes.js';

/** 开发旁路认证：仅开发环境且显式开启时注入 readonly 占位用户 */
export function tryDevBypass(req: AuthenticatedRequest, next: NextFunction): boolean {
  if (!(
    config.NODE_ENV === 'development' &&
    config.DEV_SKIP_AUTH &&
    config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production'
  )) {
    return false;
  }
  logger.info({ middleware: 'jwtAuth', path: req.path }, '[jwtAuth] 开发旁路认证（readonly）');
  req.user = {
    sub: 'dev-user',
    role: 'readonly',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
  };
  attachAuthLogContext(req);
  next();
  return true;
}
