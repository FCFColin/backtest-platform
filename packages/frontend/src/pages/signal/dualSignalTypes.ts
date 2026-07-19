/**
 * @file DualSignal 共享类型
 * @description 抽离自 DualSignalPage 的 DualSignalResponse/SignalDir 类型，
 *              供 useDualSignalState / DualSignalParams / DualSignalResults / DualSignalPage 共享。
 */
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';

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
