import type {
  BacktestParameters,
  BacktestResult,
  CashflowLeg,
  OneTimeCashflow,
  Portfolio,
} from '@backtest/shared';
export type BacktestSeriesField = 'rollingReturns' | 'allocationHistory' | 'drawdownEpisodes';
export interface BacktestState {
  portfolios: Portfolio[];
  portfolioCounter: number;
  results: BacktestResult | null;
  resultsStale: boolean;
  error: string | null;
  isLoading: boolean;
  activeTab: string;
  hasLoadedFromShare: boolean;
  _abortController: AbortController | null;
  parameters: BacktestParameters;
  addPortfolio: (presetId?: string) => void;
  removePortfolio: (id: string) => void;
  duplicatePortfolio: (id: string) => void;
  updatePortfolio: (
    id: string,
    updates: Partial<
      Pick<
        Portfolio,
        | 'name'
        | 'assets'
        | 'rebalanceFrequency'
        | 'rebalanceThreshold'
        | 'rebalanceOffset'
        | 'rebalanceBands'
        | 'drag'
        | 'isGlidepath'
        | 'glidepathFrom'
        | 'glidepathTo'
        | 'glidepathYears'
        | 'glidepathToWeights'
        | 'tags'
      >
    >,
  ) => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  updateParameter: <K extends keyof BacktestParameters>(
    key: K,
    value: BacktestParameters[K],
  ) => void;
  runBacktest: () => Promise<void>;
  enrichSeries: (series: BacktestSeriesField[]) => Promise<void>;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
}
export type SetFn = (
  partial: Partial<BacktestState> | ((state: BacktestState) => Partial<BacktestState>),
) => void;
export type GetFn = () => BacktestState;
