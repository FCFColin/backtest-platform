/**
 * 相关性矩阵计算 — 从 backtestRunner.ts 拆分
 */

import type { PortfolioResult } from '@backtest/shared/types.js';
import { calcDailyReturns, calcCorrelation } from './statistics.js';

export function calcCorrelationMatrix(portfolioResults: PortfolioResult[]): number[][] {
  const n = portfolioResults.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (j < i) {
        matrix[i][j] = matrix[j][i];
      } else {
        const returns1 = calcDailyReturns(portfolioResults[i].growthCurve.map((g) => g.value));
        const returns2 = calcDailyReturns(portfolioResults[j].growthCurve.map((g) => g.value));
        matrix[i][j] = calcCorrelation(returns1, returns2);
      }
    }
  }

  return matrix;
}
