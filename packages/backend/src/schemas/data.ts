import { z } from 'zod';

// Validation: 数据服务路由请求体/查询参数运行时校验（/api/v1/data/*）
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body/query可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

/** GET /api/v1/data/history 查询参数（T-39） */
export const historyQuerySchema = z
  .object({
    tickers: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((q) => q.startDate <= q.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  });

/** GET /api/v1/data/search */
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  market: z.string().max(50).optional(),
});

/** GET /api/v1/data/cpi */
export const cpiQuerySchema = z.object({
  country: z.enum(['us', 'cn', 'US', 'CN']).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

/** GET /api/v1/data/manage/tickers 查询参数 */
export const tickerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/v1/data/manage/search 查询参数 */
export const tickerSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});
