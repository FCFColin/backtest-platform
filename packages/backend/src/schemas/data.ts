import { z } from 'zod';
import { paginationQuerySchema } from './shared.js';

// Validation: 数据服务路由请求体/查询参数运行时校验（/api/v1/data/*）
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body/query可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

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

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  market: z.string().max(50).optional(),
});

export const cpiQuerySchema = z.object({
  country: z.enum(['us', 'cn', 'US', 'CN']).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const tickerListQuerySchema = z.object(paginationQuerySchema);

export const tickerSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export const customTickerCreateSchema = z.object({
  ticker: z.string().trim().min(1, 'ticker 不能为空').max(50),
  name: z.string().max(200).optional(),
  data: z.array(z.record(z.string(), z.unknown())).min(1, 'data 不能为空').max(10000),
});
