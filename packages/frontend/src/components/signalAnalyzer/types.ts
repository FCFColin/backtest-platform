import type { SignalType, SignalAnalysisResult } from '@backtest/shared/types/signal';

export const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;

export const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'entry', label: '入场（买入）' },
  { value: 'exit', label: '出场（卖出）' },
  { value: 'both', label: '两者' },
];

export const tooltipStyle: Record<string, string> = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

export interface SignalParamsPanelProps {
  ticker: string;
  setTicker: (v: string) => void;
  indicator: string;
  setIndicator: (v: string) => void;
  period: number;
  setPeriod: (v: number) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  signalType: SignalType;
  setSignalType: (v: SignalType) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}

export interface SignalResultsPanelProps {
  error: string | null;
  results: SignalAnalysisResult | null;
  isLoading: boolean;
}
