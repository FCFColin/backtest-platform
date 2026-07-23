/**
 * 服务端持久化（组合/命名配置/回测运行）请求校验 schema（ADR-034）
 *
 * 企业理由：这些端点接收用户自由构造的 JSON 并写入 JSONB 列，必须先经 Zod 校验
 * 约束形态与大小，防止脏数据落库或借超大 payload 进行 DoS。
 */
import { z } from 'zod';
import { ALL_REBALANCE_FREQUENCIES } from '@backtest/shared/constants';
import { assetSchema } from './shared.js';

/** 组合创建/更新请求体 */
export const portfolioBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  assets: z.array(assetSchema).min(1).max(200),
  rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES).optional(),
});

/** 命名配置创建/更新请求体（config 为完整回测请求，原样存储） */
export const savedConfigBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.unknown()),
});

/** 回测运行创建请求体 */
export const backtestRunBodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  request: z.record(z.string(), z.unknown()),
  result: z.unknown().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
});

export type PortfolioBody = z.infer<typeof portfolioBodySchema>;
export type SavedConfigBody = z.infer<typeof savedConfigBodySchema>;
export type BacktestRunBody = z.infer<typeof backtestRunBodySchema>;
