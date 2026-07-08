import { create } from 'zustand';
import { createDefaultPortfolio, defaultParameters } from './utils/backtestHelpers.js';
import { createRunActions } from './backtestActions.js';
import { createPortfolioActions } from './backtestPortfolioActions.js';
import type { BacktestState, BacktestSeriesField, SetFn, GetFn } from './backtestStoreTypes.js';

export type { BacktestState, BacktestSeriesField, SetFn, GetFn };

export const useBacktestStore = create<BacktestState>()((set, get) => ({
  portfolios: [createDefaultPortfolio(1)],
  parameters: defaultParameters,
  results: null,
  isLoading: false,
  activeTab: 'summary',
  portfolioCounter: 1,
  hasLoadedFromShare: false,
  _abortController: null as AbortController | null,

  ...createRunActions(set, get),
  ...createPortfolioActions(set, get),
}));
