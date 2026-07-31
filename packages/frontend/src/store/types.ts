import type { Asset, BacktestParameters, BacktestResult, CashflowLeg, OneTimeCashflow, Portfolio } from '@backtest/shared';
import type { WarningInfo } from '../utils/errorReporter.js';
export type BacktestSeriesField = 'rollingReturns' | 'allocationHistory' | 'drawdownEpisodes';
export interface DateRangeInfo {
  requested: { start: string; end: string };
  actual: { start: string; end: string };
  clamped: boolean;
  missingTickers?: string[];
}
export interface BacktestState {
  portfolios: Portfolio[];
  portfolioCounter: number;
  results: BacktestResult | null;
  warnings: WarningInfo[];
  dateRange: DateRangeInfo | null;
  isLoading: boolean;
  activeTab: string;
  hasLoadedFromShare: boolean;
  _abortController: AbortController | null;
  parameters: BacktestParameters;
  addPortfolio: (presetId?: string) => void;
  removePortfolio: (id: string) => void;
  duplicatePortfolio: (id: string) => void;
  addAsset: (portfolioId: string) => void;
  removeAsset: (portfolioId: string, ticker: string) => void;
  updateAsset: (portfolioId: string, assetIndex: number, updates: Partial<Asset>) => void;
  batchUpdateAssets: (portfolioId: string, updates: Array<{ index: number; weight: number }>) => void;
  updatePortfolio: (id: string, updates: Partial<Pick<Portfolio, 'name' | 'assets' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands' | 'drag' | 'totalReturn' | 'isGlidepath' | 'glidepathFrom' | 'glidepathTo' | 'glidepathYears' | 'glidepathToWeights' | 'tags'>>) => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  updateParameter: <K extends keyof BacktestParameters>(key: K, value: BacktestParameters[K]) => void;
  runBacktest: () => Promise<void>;
  enrichSeries: (series: BacktestSeriesField[]) => Promise<void>;
  setResults: (results: BacktestResult | null) => void;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
}
export type SetFn = (partial: Partial<BacktestState> | ((state: BacktestState) => Partial<BacktestState>)) => void;
export type GetFn = () => BacktestState;
export type { WarningInfo };
