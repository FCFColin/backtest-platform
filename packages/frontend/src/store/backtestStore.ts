import { create } from 'zustand';
import { portfolioSlice } from './portfolioSlice.js';
import { parametersSlice } from './parametersSlice.js';
import { cashflowSlice } from './cashflowSlice.js';
import { executionSlice } from './executionSlice.js';
import type { BacktestState } from './types.js';

export const useBacktestStore = create<BacktestState>()((set, get) => ({
  ...portfolioSlice(set, get),
  ...parametersSlice(set, get),
  ...cashflowSlice(set, get),
  ...executionSlice(set, get),
}));
