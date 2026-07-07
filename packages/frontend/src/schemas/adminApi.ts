import { z } from 'zod/v4';

const serviceHealthSchema = z.object({
  status: z.string(),
  latency_ms: z.number().optional(),
  version: z.string().optional(),
  error: z.string().optional(),
});

export const adminStatsSchema = z.object({
  services: z
    .object({
      go_engine: serviceHealthSchema.optional(),
      go_data_service: serviceHealthSchema.optional(),
    })
    .optional(),
  data_stats: z
    .object({
      total_tickers: z.number().optional(),
      total_size_mb: z.number().optional(),
      date_ranges: z
        .object({
          earliest: z.string().optional(),
          latest: z.string().optional(),
        })
        .optional(),
      by_market: z
        .record(
          z.string(),
          z.object({
            stocks: z.number().optional(),
            count: z.number().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  system: z
    .object({
      memory: z
        .object({
          rss_mb: z.number().optional(),
        })
        .optional(),
      uptime_formatted: z.string().optional(),
    })
    .optional(),
});

const marketBreakdownEntry = z.object({
  stocks: z.number().optional(),
  count: z.number().optional(),
});

export const dataManageStatsSchema = z.object({
  stats: z
    .object({
      data_quality: z
        .object({
          total_data_points: z.number().optional(),
          total_size_mb: z.number().optional(),
        })
        .optional(),
      date_ranges: z
        .object({
          earliest: z.string(),
          latest: z.string(),
        })
        .optional(),
      by_market: z.record(z.string(), marketBreakdownEntry).optional(),
    })
    .optional(),
  universe: z
    .object({
      total: z.number().optional(),
    })
    .optional(),
});

export const adminSystemSchema = z.object({
  memory: z
    .object({
      rss_mb: z.number(),
      heap_used_mb: z.number(),
      heap_total_mb: z.number(),
      external_mb: z.number(),
    })
    .optional(),
  uptime: z
    .object({
      seconds: z.number(),
      formatted: z.string(),
    })
    .optional(),
  data_directory: z
    .object({
      total_size_mb: z.number(),
      ticker_file_count: z.number(),
      total_data_points: z.number(),
    })
    .optional(),
});
