// 杠杆 ETF 滑点（LETF Slippage）类型定义

/** LETF 滑点分析请求 */
export interface LETFRequest {
  /** 杠杆 ETF ticker */
  letfTicker: string;
  /** 基准指数 ticker */
  benchmarkTicker: string;
  /** 杠杆倍数 */
  leverage: number;
  startDate: string;
  endDate: string;
}

/** LETF 滑点分析结果 */
export interface LETFResult {
  /** 滑点曲线 */
  slippageCurve: Array<{ date: string; slippage: number }>;
  /** 年化拖累 */
  annualDecay: number;
  /** 实际杠杆 vs 名义杠杆 */
  effectiveLeverage: number[];
  /** 对比统计 */
  stats: {
    benchmarkReturn: number;
    letfReturn: number;
    expectedReturn: number;
    slippage: number;
  };
}
