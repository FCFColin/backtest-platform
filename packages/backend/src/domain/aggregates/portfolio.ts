import { Ticker, Weight, DomainValidationError } from '../value-objects/index.js';
import type {
  Portfolio as PortfolioDTO,
  RebalanceFrequency,
  RebalanceBands,
} from '@backtest/shared/types';

export interface PortfolioHolding {
  ticker: Ticker;
  weight: Weight;
}

const PORTFOLIO_WEIGHT_SUM_TOLERANCE = 1;

type PortfolioConfigKeys =
  | 'rebalanceFrequency'
  | 'rebalanceThreshold'
  | 'rebalanceOffset'
  | 'rebalanceBands'
  | 'drag'
  | 'totalReturn'
  | 'isGlidepath'
  | 'glidepathFrom'
  | 'glidepathTo'
  | 'glidepathYears'
  | 'glidepathToWeights';
type PortfolioConfig = Partial<Pick<PortfolioDTO, PortfolioConfigKeys>>;
interface PortfolioProps extends PortfolioConfig {
  id: string;
  name: string;
  holdings: PortfolioHolding[];
}

export class Portfolio {
  public readonly id: string;
  public readonly name: string;
  private holdings: PortfolioHolding[];
  public readonly rebalanceFrequency: RebalanceFrequency;
  public readonly rebalanceThreshold?: number;
  public readonly rebalanceOffset?: number;
  public readonly rebalanceBands?: RebalanceBands;
  public readonly drag?: number;
  public readonly totalReturn?: boolean;
  public readonly isGlidepath?: boolean;
  public readonly glidepathFrom?: string;
  public readonly glidepathTo?: string;
  public readonly glidepathYears?: number;
  public readonly glidepathToWeights?: number[];

  private constructor(props: PortfolioProps) {
    this.id = props.id;
    this.name = props.name;
    this.holdings = props.holdings;
    this.rebalanceFrequency = props.rebalanceFrequency ?? 'monthly';
    this.rebalanceThreshold = props.rebalanceThreshold;
    this.rebalanceOffset = props.rebalanceOffset;
    this.rebalanceBands = props.rebalanceBands;
    this.drag = props.drag;
    this.totalReturn = props.totalReturn;
    this.isGlidepath = props.isGlidepath;
    this.glidepathFrom = props.glidepathFrom;
    this.glidepathTo = props.glidepathTo;
    this.glidepathYears = props.glidepathYears;
    this.glidepathToWeights = props.glidepathToWeights;
    this.validateWeightSum();
  }

  /** @throws {DomainValidationError} ticker 非法/权重越界/权重和偏差 > 容差 */
  static fromDTO(dto: PortfolioDTO): Portfolio {
    const { assets, ...rest } = dto;
    const holdings: PortfolioHolding[] = assets.map((asset) => {
      try {
        return { ticker: Ticker.create(asset.ticker), weight: Weight.create(asset.weight) };
      } catch (err) {
        throw new DomainValidationError((err as Error).message, 'asset', asset);
      }
    });
    return new Portfolio({
      ...rest,
      id: rest.id ?? crypto.randomUUID(),
      name: rest.name ?? 'Portfolio',
      holdings,
    });
  }

  static create(
    id: string,
    name: string,
    holdings: PortfolioHolding[],
    config?: PortfolioConfig,
  ): Portfolio {
    return new Portfolio({ id, name, holdings, ...config });
  }

  get holdingCount(): number {
    return this.holdings.length;
  }

  get tickers(): string[] {
    return this.holdings.map((h) => h.ticker.value);
  }

  get totalWeight(): number {
    return this.holdings.reduce((acc, h) => acc + h.weight.value, 0);
  }

  get maxWeight(): number {
    return this.holdings.reduce((max, h) => Math.max(max, h.weight.value), 0);
  }

  toEngineBody(): Record<string, unknown> {
    return {
      name: this.name,
      assets: this.holdings.map((h) => ({
        ticker: h.ticker.value,
        weight: h.weight.value,
      })),
      rebalanceFrequency: this.rebalanceFrequency,
      rebalanceThreshold: this.rebalanceThreshold,
      rebalanceOffset: this.rebalanceOffset,
      drag: this.drag,
      totalReturn: this.totalReturn,
      rebalanceBands: this.rebalanceBands?.enabled
        ? {
            absoluteBand: this.rebalanceBands.absoluteBand,
            relativeBand: this.rebalanceBands.relativeBand,
          }
        : undefined,
      glidepathToWeights: this.isGlidepath ? this.glidepathToWeights : undefined,
      glidepathYears: this.isGlidepath ? this.glidepathYears : undefined,
    };
  }

  /** ADR-013: 持久化使用领域验证后的 DTO，非原始请求体 */
  toPersistenceDTO(): {
    name: string;
    assets: { ticker: string; weight: number }[];
    rebalanceFrequency: RebalanceFrequency;
  } {
    return {
      name: this.name,
      assets: this.holdings.map((h) => ({ ticker: h.ticker.value, weight: h.weight.value })),
      rebalanceFrequency: this.rebalanceFrequency,
    };
  }

  private validateWeightSum(): void {
    const sum = this.totalWeight;
    if (Math.abs(sum - 100) > PORTFOLIO_WEIGHT_SUM_TOLERANCE) {
      throw new DomainValidationError(
        `Portfolio weights must sum to ~100 (percent), got ${sum.toFixed(2)}`,
        'totalWeight',
        sum,
      );
    }
  }
}
