/**
 * 前端错误上报端点（P1-3 错误监控完整性）。
 *
 * POST /api/v1/errors — 接收前端错误报告，写入 Pino 结构化日志。
 *
 * 设计要点：
 * - 无需认证：认证失败时前端也需要上报错误
 * - 限流 10/min/IP：防滥用（在 app.ts 中通过 apiLimiter 已覆盖）
 * - 仅写入日志，不持久化到 DB（OTel/Pino 采集系统负责聚合）
 * - 请求体大小限制：依赖全局 express.json({ limit: '10mb' })
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';

const router = Router();

/** 错误上报请求体 Zod schema */
const errorReportSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(10000).optional(),
  context: z
    .object({
      component: z.string().max(200).optional(),
      action: z.string().max(200).optional(),
      jobId: z.string().max(100).optional(),
    })
    .passthrough()
    .optional(),
  timestamp: z.string().max(50).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
});

/**
 * POST /api/v1/errors — 接收前端错误报告。
 *
 * 将前端错误写入 Pino 结构化日志，供 OTel/Prometheus 采集系统聚合分析。
 * 无需认证（认证失败时前端也需要上报），限流由全局 apiLimiter 覆盖。
 */
router.post('/', (req: Request, res: Response) => {
  const parseResult = errorReportSchema.safeParse(req.body);
  if (!parseResult.success) {
    sendProblem(res, 400, 'INVALID_ERROR_REPORT', {
      detail: 'Error report payload validation failed',
    });
    return;
  }

  const { message, stack, context, timestamp, url, userAgent } = parseResult.data;

  // 写入结构化日志，OTel 可采集
  logger.warn(
    {
      frontendError: {
        message,
        stack: stack?.slice(0, 2000),
        context,
        timestamp,
        url,
        userAgent: userAgent?.slice(0, 200),
      },
    },
    '[frontend-error] Client error reported',
  );

  res.status(202).json({ success: true });
});

export default router;
