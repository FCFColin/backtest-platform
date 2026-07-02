import { z } from 'zod';

/** GET /api/v1/data/history 查询参数（T-39） */
export const historyQuerySchema = z
  .object({
    tickers: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((q) => q.startDate <= q.endDate, {
    message: 'startDate 必须早于或等于 endDate',
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

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
