import type {
  Portfolio,
  Asset,
  BacktestParameters,
  BacktestResult,
  CashflowLeg,
  OneTimeCashflow,
} from '@backtest/shared';

export type BacktestSeriesField = 'rollingReturns' | 'allocationHistory' | 'drawdownEpisodes';

export interface BacktestState {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  results: BacktestResult | null;
  isLoading: boolean;
  activeTab: string;
  portfolioCounter: number;
  hasLoadedFromShare: boolean;
  _abortController: AbortController | null;

  addPortfolio: () => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  duplicatePortfolio: (id: string) => void;
  removePortfolio: (id: string) => void;
  addAsset: (portfolioId: string) => void;
  removeAsset: (portfolioId: string, ticker: string) => void;
  updateAsset: (portfolioId: string, assetIndex: number, updates: Partial<Asset>) => void;
  batchUpdateAssets: (
    portfolioId: string,
    updates: Array<{ index: number; weight: number }>,
  ) => void;
  updatePortfolio: (
    id: string,
    updates: Partial<
      Pick<
        Portfolio,
        | 'name'
        | 'rebalanceFrequency'
        | 'rebalanceThreshold'
        | 'rebalanceOffset'
        | 'rebalanceBands'
        | 'drag'
        | 'totalReturn'
        | 'isGlidepath'
        | 'glidepathFrom'
        | 'glidepathTo'
        | 'glidepathYears'
        | 'glidepathToWeights'
      >
    >,
  ) => void;
  updateParameter: <K extends keyof BacktestParameters>(
    key: K,
    value: BacktestParameters[K],
  ) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  setResults: (results: BacktestResult | null) => void;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
  runBacktest: () => Promise<void>;
  enrichSeries: (series: BacktestSeriesField[]) => Promise<void>;
}

export type SetFn = (
  partial: Partial<BacktestState> | ((state: BacktestState) => Partial<BacktestState>),
) => void;

export type GetFn = () => BacktestState;
