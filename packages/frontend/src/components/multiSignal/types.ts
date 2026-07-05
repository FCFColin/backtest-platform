import type { SignalAnalysisResult } from '@backtest/shared/types/signal';

export const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;

export const AGGREGATION_METHODS: { value: 'weighted' | 'voting' | 'rank'; label: string }[] = [
  { value: 'weighted', label: '加权' },
  { value: 'voting', label: '投票' },
  { value: 'rank', label: '排名' },
];

export const tooltipStyle: Record<string, string> = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

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

export interface MultiSignalParamsProps {
  signals: SignalItem[];
  weights: number[];
  aggregationMethod: 'weighted' | 'voting' | 'rank';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onAddSignal: () => void;
  onRemoveSignal: (id: number) => void;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onUpdateWeight: (idx: number, val: number) => void;
  onAggregationMethodChange: (m: 'weighted' | 'voting' | 'rank') => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

export interface MultiSignalResultsProps {
  results: MultiSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}
