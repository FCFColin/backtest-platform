// 信号分析（Signal Analyzer）类型定义

/** 信号分析类型 */
export type SignalType = 'entry' | 'exit' | 'both';

/** 单信号分析请求 */
export interface SignalAnalysisRequest {
  ticker: string;
  indicator: string;
  period: number;
  threshold: number;
  startDate: string;
  endDate: string;
  signalType: SignalType;
}

/** 信号分析结果 */
export interface SignalAnalysisResult {
  signals: Array<{ date: string; type: 'buy' | 'sell'; price: number }>;
  statistics: {
    totalSignals: number;
    winRate: number;
    avgReturn: number;
    maxDrawdown: number;
    sharpe: number;
  };
  equityCurve: Array<{ date: string; value: number }>;
}

/** 双信号配置 */
export interface DualSignalConfig {
  signal1: SignalAnalysisRequest;
  signal2: SignalAnalysisRequest;
  combinationMethod: 'and' | 'or' | 'xor';
}

/** 多信号配置 */
export interface MultiSignalConfig {
  signals: SignalAnalysisRequest[];
  aggregationMethod: 'weighted' | 'voting' | 'rank';
  weights?: number[];
}
