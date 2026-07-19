/**
 * @file 多信号聚合页面共享类型
 * @description 多信号聚合相关响应、信号项、聚合方式类型，供 hook 与子组件复用
 */
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';

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
