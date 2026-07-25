/**
 * API 弃用响应头中间件（P2-05, RFC 8594）
 *
 * 企业理由：API 端点弃用时需要向客户端发出明确信号，使其有充足时间迁移。
 * 通过 HTTP 响应头标准化传递弃用信息：
 * - Deprecation: 弃用日期（true 或 RFC 1123 日期）
 * - Sunset: 关闭日期（RFC 1123 日期），至少比 Deprecation 晚 12 个月
 * - Link: rel="successor-version" 指向替代端点
 *
 * 用法：
 *   import { createDeprecationMiddleware } from './middleware/deprecationHeaders.js';
 *   app.use('/api/legacy-endpoint', createDeprecationMiddleware({
 *     deprecated: '2025-01-01',
 *     sunset: '2026-01-01',
 *     successor: '/api/v1/new-endpoint',
 *   }));
 */

import type { Request, Response, NextFunction } from 'express';

/** 弃用配置 */
export interface DeprecationConfig {
  /** 弃用日期（ISO 8601 或 'true'） */
  deprecated: string;
  /** 关闭日期（ISO 8601），至少比 deprecated 晚 12 个月 */
  sunset?: string;
  /** 替代端点 URL（相对路径或绝对 URL） */
  successor?: string;
}

/**
 * 创建弃用响应头中间件。
 *
 * @param config - 弃用配置（日期、关闭日期、替代端点）
 * @returns Express 中间件函数，在响应中添加 Deprecation/Sunset/Link 头
 */
export function createDeprecationMiddleware(config: DeprecationConfig) {
  const { deprecated, sunset, successor } = config;

  return function deprecationHeaders(_req: Request, res: Response, next: NextFunction): void {
    // RFC 8594: Deprecation 头——'true' 或 ISO 8601 日期
    res.setHeader('Deprecation', deprecated);

    // RFC 8594: Sunset 头——ISO 8601 日期，告知客户端端点将被移除
    if (sunset) {
      res.setHeader('Sunset', sunset);
    }

    // Link 头：指向替代端点（rel="successor-version"）
    if (successor) {
      res.setHeader('Link', `<${successor}>; rel="successor-version"`);
    }

    next();
  };
}
