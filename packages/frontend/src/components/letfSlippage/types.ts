import type { LETFResult } from '@backtest/shared';

export interface StatRow {
  metric: string;
  value: number;
}

export interface LETFParamsProps {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onLetfTickerChange: (v: string) => void;
  onBenchmarkTickerChange: (v: string) => void;
  onLeverageChange: (v: number) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

export interface LETFResultsProps {
  results: LETFResult | null;
  error: string | null;
  isLoading: boolean;
  leverage: number;
}
