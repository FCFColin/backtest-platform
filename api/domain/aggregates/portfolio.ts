// DDD: Portfolio Aggregate — 事务边界+业务规则
// T-30：权重和校验使用百分比（≈100），与引擎 shared/types + engine/portfolio 一致。

import { Ticker } from '../value-objects/ticker.js';
import { Weight } from '../value-objects/weight.js';
import { invariant } from '../../utils/invariant.js';

export interface PortfolioHolding {
  ticker: Ticker;
  weight: Weight;
}

/** 组合权重和容差（百分比点） */
export const PORTFOLIO_WEIGHT_SUM_TOLERANCE = 1;

export class Portfolio {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    private holdings: PortfolioHolding[],
  ) {
    this.validateWeightSum();
  }

  static create(id: string, name: string, holdings: PortfolioHolding[]): Portfolio {
    return new Portfolio(id, name, holdings);
  }

  getHoldings(): ReadonlyArray<PortfolioHolding> {
    return Object.freeze([...this.holdings]);
  }

  addHolding(holding: PortfolioHolding): Portfolio {
    const newHoldings = [...this.holdings, holding];
    return new Portfolio(this.id, this.name, newHoldings);
  }

  removeHolding(ticker: Ticker): Portfolio {
    const newHoldings = this.holdings.filter((h) => !h.ticker.equals(ticker));
    return new Portfolio(this.id, this.name, newHoldings);
  }

  private validateWeightSum(): void {
    const sum = this.holdings.reduce((acc, h) => acc + h.weight.value, 0);
    if (Math.abs(sum - 100) > PORTFOLIO_WEIGHT_SUM_TOLERANCE) {
      throw new Error(`Portfolio weights must sum to ~100 (percent), got ${sum.toFixed(2)}`);
    }
  }
}

export function validatePortfolioInvariants(portfolio: {
  holdings: ReadonlyArray<{ ticker: unknown; weight: { value: number } }>;
  cash?: number;
  nav?: number;
}): void {
  const totalWeight = portfolio.holdings.reduce((s, h) => s + h.weight.value, 0);
  invariant(
    Math.abs(totalWeight - 100) <= PORTFOLIO_WEIGHT_SUM_TOLERANCE,
    `Portfolio weights sum to ${totalWeight}, expected ~100`,
  );

  for (const holding of portfolio.holdings) {
    invariant(
      holding.weight.value >= 0,
      `Negative weight: ${holding.weight.value}`,
    );
  }

  if (portfolio.cash !== undefined && portfolio.nav !== undefined) {
    invariant(
      portfolio.nav >= 0,
      `NAV must be non-negative: ${portfolio.nav}`,
    );
  }
}
