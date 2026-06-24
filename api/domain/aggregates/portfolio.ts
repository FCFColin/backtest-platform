// DDD: Portfolio Aggregate — 事务边界+业务规则
// 企业为何需要：权重和校验（=1.0）散落各处，集中到Aggregate后规则一致
// 权衡：Aggregate增加一层间接，但业务规则集中后修改只需改一处

import { Ticker } from '../value-objects/ticker.js';
import { Weight } from '../value-objects/weight.js';

export interface PortfolioHolding {
  ticker: Ticker;
  weight: Weight;
}

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
    const newHoldings = this.holdings.filter(h => !h.ticker.equals(ticker));
    return new Portfolio(this.id, this.name, newHoldings);
  }

  private validateWeightSum(): void {
    const sum = this.holdings.reduce((acc, h) => acc + h.weight.value, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error(`Portfolio weights must sum to 1.0, got ${sum.toFixed(4)}`);
    }
  }
}
