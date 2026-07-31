import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
export type SignalDir = 'buy' | 'sell' | null;
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
export type AggregationMethod = 'weighted' | 'voting' | 'rank';
export interface MultiSignalResponse {
  aggregated: SignalAnalysisResult;
  contributions: Array<{
    index: number;
    indicator: string;
    contribution: number;
    statistics: SignalAnalysisResult['statistics'];
  }>;
}
export interface SignalItem {
  id: number;
  indicator: string;
  period: number;
  threshold: number;
}
