/**
 * @file 信号页面共享类型
 * @description 合并自 dualSignalTypes.ts 与 multiSignalTypes.ts。
 *   集中定义双信号对比与多信号聚合的响应/枚举类型，供 signal 子模块复用。
 */
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';

// ============ 双信号对比 ============

/** 信号方向 */
export type SignalDir = 'buy' | 'sell' | null;

/** 双信号对比响应（与后端 DualSignalResult 对齐） */
export interface DualSignalResponse {
  signal1: SignalAnalysisResult;
  signal2: SignalAnalysisResult;
  combined: SignalAnalysisResult;
  comparison: Array<{
    date: string;
    signal1: SignalDir;
    signal2: SignalDir;
    combined: SignalDir;
  }>;
}

// ============ 多信号聚合 ============

/** 聚合方式：加权 / 投票 / 排名 */
export type AggregationMethod = 'weighted' | 'voting' | 'rank';

/** 多信号聚合响应（与后端 MultiSignalResult 对齐） */
export interface MultiSignalResponse {
  aggregated: SignalAnalysisResult;
  contributions: Array<{
    index: number;
    indicator: string;
    contribution: number;
    statistics: SignalAnalysisResult['statistics'];
  }>;
}

/** 信号列表项（页面内简化结构） */
export interface SignalItem {
  id: number;
  indicator: string;
  period: number;
  threshold: number;
}
