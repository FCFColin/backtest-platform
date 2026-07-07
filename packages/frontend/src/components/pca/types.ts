import type { PCAResult } from '@backtest/shared';

export interface PCAParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numComponents: number | '';
  isLoading: boolean;
  onAddTicker: () => void;
  onRemoveTicker: (idx: number) => void;
  onUpdateTicker: (idx: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumComponentsChange: (v: number | '') => void;
  onRun: () => void;
}

export interface PCAResultsProps {
  results: PCAResult | null;
  error: string | null;
  isLoading: boolean;
}
