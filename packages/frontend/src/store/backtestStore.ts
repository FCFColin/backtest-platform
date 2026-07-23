import { create } from 'zustand';
import type { BacktestParameters } from '@backtest/shared';
import { portfolioSlice } from './portfolioSlice.js';
import { cashflowSlice } from './cashflowSlice.js';
import { executionSlice } from './executionSlice.js';
import { defaultParameters } from './backtestHelpers.js';
import type { BacktestState, SetFn, GetFn } from './types.js';

/**
 * 参数 slice（合并自 parametersSlice.ts）：管理回测参数的初始值与更新。
 * 因体量极小（单字段 + 单 setter），直接内联到 store 入口，避免独立文件。
 */
function parametersSlice(set: SetFn, _get: GetFn) {
  return {
    parameters: defaultParameters as BacktestParameters,

    updateParameter: <K extends keyof BacktestParameters>(key: K, value: BacktestParameters[K]) =>
      set((state) => ({ parameters: { ...state.parameters, [key]: value } })),
  };
}

export const useBacktestStore = create<BacktestState>()((set, get) => ({
  ...portfolioSlice(set, get),
  ...parametersSlice(set, get),
  ...cashflowSlice(set, get),
  ...executionSlice(set, get),
}));
