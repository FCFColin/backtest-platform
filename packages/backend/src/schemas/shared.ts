import { z } from 'zod';

/** 共享 asset schema，确保 ticker 字段在所有端点校验一致 */
export const assetSchema = z.object({
  ticker: z.string().trim().min(1).max(32),
  weight: z.number().nonnegative(),
});
