/**
 * data-fetcher HTTP 响应 zod 契约（消费端防线）。
 *
 * ⚠️ 与 data-fetcher/internal/store/store.go 的 JSON tag 逐字段绑定：
 *   - PricePoint{date, open, high, low, close, adjusted_close(*float64→null), volume, dividend, split_factor}
 *   - CPIEntry{date, value} / TreasuryRate{date, rate}
 * 以及 data-fetcher/internal/handlers/data.go 的信封 {success, data, degraded?}。
 * store.go / handlers/data.go 字段或语义变更必须同步本文件（R-12/A4：adjusted_close null=未确认复权，
 * 消费端 ?? close 兜底）；Go 侧 nil 切片 JSON 序列化为 null（如空区间过滤结果），schema 以 nullable 容忍。
 */
import { z } from 'zod';

/**
 * store.go PricePoint。生产端（Go struct 无 omitempty）恒发全部 9 字段；
 * 消费端按需消费（当前仅 date/close），故 date/close 为必填、其余为可选类型校验。
 * adjusted_close: null = 未确认复权（R-12/A4），存在时必须为 number。
 */
export const pricePointSchema = z.object({
  date: z.string(),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number(),
  adjusted_close: z.number().nullable().optional(),
  volume: z.number().optional(),
  dividend: z.number().optional(),
  split_factor: z.number().optional(),
});

/** GET /api/data/price/:ticker 的 data（Go nil 切片 → null = 空集） */
export const pricePointArraySchema = z.array(pricePointSchema).nullable();

/** store.go CPIEntry */
export const cpiEntrySchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const cpiEntryArraySchema = z.array(cpiEntrySchema).nullable();

/** store.go TreasuryRate（U-2 Phase 1，小数形式年化报价） */
export const treasuryRateSchema = z.object({
  date: z.string(),
  rate: z.number(),
});

export const treasuryRateArraySchema = z.array(treasuryRateSchema).nullable();

/** POST /api/data/price/batch 的 data[ticker] 失败形态（providers 不可用 / panic / 标的不存在） */
export const batchErrorEntrySchema = z.object({
  error: z.string(),
  degraded: z.boolean().optional(),
});

/** data[ticker] = PricePoint[]（成功，nil 切片→null）| {error, degraded?}（失败） */
export const batchPriceEntrySchema = z.union([
  z.array(pricePointSchema).nullable(),
  batchErrorEntrySchema,
]);

/** POST /api/data/price/batch 响应信封（handlers/data.go HandleBatchPriceData） */
export const batchPriceResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), batchPriceEntrySchema),
  degraded: z.boolean().optional(),
});

/** 精简 issue 摘要（日志可观测用，避免整包 zod error 序列化爆炸） */
export function summarizeZodIssues(error: z.ZodError, max = 3): string[] {
  return error.issues.slice(0, max).map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
}

export type PricePoint = z.infer<typeof pricePointSchema>;
export type CpiEntry = z.infer<typeof cpiEntrySchema>;
export type TreasuryRate = z.infer<typeof treasuryRateSchema>;
export type BatchPriceResponse = z.infer<typeof batchPriceResponseSchema>;
