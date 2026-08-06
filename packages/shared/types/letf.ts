export interface LETFRequest {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
}

export interface LETFResult {
  slippageCurve: Array<{ date: string; slippage: number }>;
  annualDecay: number;
  effectiveLeverage: (number | null)[];
  stats: {
    benchmarkReturn: number;
    letfReturn: number;
    expectedReturn: number;
    slippage: number;
  };
}
