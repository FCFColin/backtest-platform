import { z } from 'zod';

/** POST /api/v1/announcements — 发布公告请求体校验 */
export const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'title 不能为空').max(200),
  body: z.string().min(1, 'body 不能为空').max(10000),
  category: z.string().max(50).optional(),
  severity: z.string().max(50).optional(),
});
