import type { BacktestParameters, Portfolio } from '@backtest/shared';
import { mockParameters, mockPortfolio } from '../backtestFixtures.js';

export const mkPortfolio = mockPortfolio;

export interface EngineReqOverrides {
  portfolio?: Partial<Portfolio>;
  parameters?: Partial<BacktestParameters>;
  /** 顶层附加字段（mcParams / tickers 等），覆盖默认键 */
  [k: string]: unknown;
}

/** 引擎计算请求体默认值集中：单组合 + 标准参数，只需传差异字段。 */
export function mkEngineReq(overrides: EngineReqOverrides = {}): Record<string, unknown> {
  const { portfolio, parameters, ...rest } = overrides;
  return {
    portfolio: mkPortfolio(portfolio),
    parameters: { ...mockParameters, ...parameters },
    ...rest,
  };
}
