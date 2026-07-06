import { z } from 'zod';

/** GET /api/v1/data/manage/tickers 查询参数 */
export const tickerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/v1/data/manage/search 查询参数 */
export const tickerSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export type TickerListQuery = z.infer<typeof tickerListQuerySchema>;
export type TickerSearchQuery = z.infer<typeof tickerSearchQuerySchema>;
