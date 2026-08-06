export type SignalType = 'entry' | 'exit' | 'both';

export interface SignalAnalysisRequest {
  ticker: string;
  indicator: string;
  period: number;
  threshold: number;
  startDate: string;
  endDate: string;
  signalType: SignalType;
}

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

export interface DualSignalConfig {
  signal1: SignalAnalysisRequest;
  signal2: SignalAnalysisRequest;
  combinationMethod: 'and' | 'or' | 'xor';
}

export interface MultiSignalConfig {
  signals: SignalAnalysisRequest[];
  aggregationMethod: 'weighted' | 'voting' | 'rank';
  weights?: number[];
}
