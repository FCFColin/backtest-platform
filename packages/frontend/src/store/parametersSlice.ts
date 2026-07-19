import type { BacktestParameters } from '@backtest/shared';
import { defaultParameters } from './backtestHelpers.js';
import type { SetFn, GetFn } from './types.js';

export function parametersSlice(set: SetFn, _get: GetFn) {
  return {
    parameters: defaultParameters as BacktestParameters,

    updateParameter: <K extends keyof BacktestParameters>(key: K, value: BacktestParameters[K]) =>
      set((state) => ({ parameters: { ...state.parameters, [key]: value } })),
  };
}
