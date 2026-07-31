import { z } from 'zod';

/** 共享 asset schema，确保 ticker 字段在所有端点校验一致 */
export const assetSchema = z.object({
  ticker: z.string().trim().min(1).max(32),
  weight: z.number().nonnegative(),
});

/** 无请求体的 action 端点校验 schema（接受空/无 body，拒绝含字段的 body） */
export const emptyBodySchema = z.object({}).strict().optional().default({});

/** 分页查询参数（page 默认 1，limit 默认 50 上限 200），供列表类 query schema 复用 */
export const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
};
