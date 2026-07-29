import { z } from 'zod';

/** POST /api/v1/errors — 前端错误上报请求体校验 */
export const errorReportSchema = z.object({
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
