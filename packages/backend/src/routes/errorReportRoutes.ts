/**
 * 前端错误/性能上报端点（P1-3 错误监控完整性 + 响应速率探测）。
 *
 * POST /api/v1/errors — 接收前端错误报告和性能指标，写入 Pino 结构化日志。
 *
 * 设计要点：
 * - 无需认证：认证失败时前端也需要上报错误
 * - 按 type 字段分流：error/vital/api_timing/component_render/page_timing/navigation
 * - 限流 10/min/IP：防滥用（在 app.ts 中通过 apiLimiter 已覆盖）
 * - 仅写入日志，不持久化到 DB（OTel/Pino/Prometheus 采集系统负责聚合）
 * - 请求体大小限制：依赖全局 express.json({ limit: '10mb' })
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/miscMiddleware.js';
import { errorReportSchema } from '../schemas/tactical.js';
import {
  recordFrontendWebVital,
  recordFrontendApiCall,
  recordFrontendComponentRender,
  recordFrontendPageLoad,
} from '../utils/metrics.js';

const router = Router();

/**
 * POST /api/v1/errors — 接收前端错误/性能报告。
 *
 * 根据 `type` 字段分流：
 * - `error`：写入 logger.warn（传统错误上报）
 * - `vital`：写入 logger.info 并采集 Prometheus Gauge（Web Vitals）
 * - `api_timing`：写入 logger.debug（API 调用耗时，高频率打点）
 * - `component_render`：写入 logger.debug（组件渲染耗时）
 * - `page_timing`：写入 logger.info（页面加载性能）
 * - `navigation`：写入 logger.debug（路由切换耗时）
 *
 * 无需认证，限流由全局 apiLimiter 覆盖。
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity, max-lines-per-function
router.post('/', validate(errorReportSchema), (req: Request, res: Response) => {
  const {
    type,
    message,
    stack,
    traceId,
    context,
    timestamp,
    url,
    userAgent,
    value,
    metric,
    endpoint,
    route,
    statusCode,
    component,
    phase,
  } = req.body;

  const logPayload: Record<string, unknown> = {
    type,
    traceId,
    timestamp,
    url: url?.slice(0, 500),
    userAgent: userAgent?.slice(0, 200),
  };

  switch (type) {
    case 'vital':
      logger.info(
        { ...logPayload, vital: { metric, value, route } },
        '[frontend-vital] Web Vital reported',
      );
      if (typeof metric === 'string' && typeof value === 'number') {
        recordFrontendWebVital(metric, value, typeof route === 'string' ? route : undefined);
      }
      break;

    case 'api_timing':
      logger.debug(
        { ...logPayload, apiTiming: { endpoint, duration: value, statusCode, route } },
        '[frontend-api-timing] API call timing reported',
      );
      if (typeof endpoint === 'string' && typeof value === 'number') {
        recordFrontendApiCall(
          endpoint,
          req.method || 'GET',
          typeof statusCode === 'number' ? statusCode : 0,
          value,
        );
      }
      break;

    case 'component_render':
      logger.debug(
        { ...logPayload, componentRender: { component, phase, duration: value } },
        '[frontend-component-render] Component render timing reported',
      );
      if (typeof component === 'string' && typeof phase === 'string' && typeof value === 'number') {
        recordFrontendComponentRender(component, phase, value);
      }
      break;

    case 'page_timing':
      logger.info(
        { ...logPayload, pageTiming: { metric, value, route } },
        '[frontend-page-timing] Page timing reported',
      );
      if (typeof metric === 'string' && typeof value === 'number') {
        recordFrontendPageLoad(metric, value);
      }
      break;

    case 'navigation':
      logger.debug(
        { ...logPayload, navigation: { route, duration: value } },
        '[frontend-navigation] Route navigation reported',
      );
      break;

    default:
      // type === 'error': 传统错误上报
      logger.warn(
        {
          ...logPayload,
          frontendError: {
            message,
            stack: stack?.slice(0, 2000),
            context,
          },
        },
        '[frontend-error] Client error reported',
      );
      break;
  }

  res.status(202).json({ success: true });
});

export default router;
