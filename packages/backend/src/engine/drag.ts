/**
 * 拖拽成本计算 — 从 backtestRunner.ts 拆分
 */

import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';

export function calculateDrag(
  portfolioValue: number[],
  _cashflows: Array<{ date: string; amount: number }>,
  _rebalanceFrequency: string,
  dragPct: number = 0.001,
): {
  totalDrag: number;
  annualDrag: number;
  dragSeries: number[];
} {
  if (portfolioValue.length === 0) {
    return { totalDrag: 0, annualDrag: 0, dragSeries: [] };
  }

  const dragSeries: number[] = [];
  let cumulativeDrag = 0;

  for (let i = 0; i < portfolioValue.length; i++) {
    const prevValue = i > 0 ? portfolioValue[i - 1] : portfolioValue[0];
    const periodDrag = (prevValue * dragPct) / TRADING_DAYS_PER_YEAR;
    cumulativeDrag += periodDrag;
    dragSeries.push(cumulativeDrag);
  }

  const years = portfolioValue.length / TRADING_DAYS_PER_YEAR;
  const finalValue = portfolioValue[portfolioValue.length - 1];
  const annualDrag = years > 0 && finalValue !== 0 ? cumulativeDrag / years / finalValue : 0;

  return {
    totalDrag: cumulativeDrag,
    annualDrag,
    dragSeries,
  };
}
