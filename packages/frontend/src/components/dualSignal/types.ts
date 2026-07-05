import type { SignalAnalysisResult } from '@backtest/shared/types/signal';

export const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;

export const COMBINATION_METHODS: { value: 'and' | 'or' | 'xor'; label: string }[] = [
  { value: 'and', label: 'AND（两者同向）' },
  { value: 'or', label: 'OR（任一触发）' },
  { value: 'xor', label: 'XOR（恰好一个）' },
];

export const tooltipStyle: Record<string, string> = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

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

export interface SignalCfg {
  indicator: string;
  period: number;
  threshold: number;
}

export interface DualSignalParamsProps {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onCfg1Change: (cfg: SignalCfg) => void;
  onCfg2Change: (cfg: SignalCfg) => void;
  onCombinationMethodChange: (m: 'and' | 'or' | 'xor') => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

export interface DualSignalResultsProps {
  results: DualSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}
