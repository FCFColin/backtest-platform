// 充血模型：组合聚合根封装权重校验、持仓管理等业务逻辑。
// application 层通过 fromDTO() 构造聚合根，通过 toEngineBody() 序列化为引擎请求体，
// 整个流程中值对象（Ticker/Weight）始终保留，不再中途丢弃。

import { Ticker, Weight } from '../value-objects/index.js';
import { DomainValidationError } from '../errors.js';
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

interface PortfolioProps {
  id: string;
  name: string;
  holdings: PortfolioHolding[];
  rebalanceFrequency?: RebalanceFrequency;
  rebalanceThreshold?: number;
  rebalanceOffset?: number;
  rebalanceBands?: RebalanceBands;
  drag?: number;
  totalReturn?: boolean;
  isGlidepath?: boolean;
  glidepathFrom?: string;
  glidepathTo?: string;
  glidepathYears?: number;
  glidepathToWeights?: number[];
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

  /**
   * 逐资产创建 Ticker（安全净化）+ Weight（0–100 百分比校验），
   * 再由构造器校验权重和 ≈ 100。携带完整再平衡/glidepath 配置。
   *
   * @throws {DomainValidationError} 当 ticker 格式非法、权重越界、或权重和偏差 > 容差时
   */
  static fromDTO(dto: PortfolioDTO): Portfolio {
    const holdings: PortfolioHolding[] = [];
    for (const asset of dto.assets) {
      let ticker: Ticker;
      let weight: Weight;
      try {
        ticker = Ticker.create(asset.ticker);
        weight = Weight.create(asset.weight);
      } catch (err) {
        throw new DomainValidationError((err as Error).message, 'asset', asset);
      }
      holdings.push({ ticker, weight });
    }
    return new Portfolio({
      id: dto.id ?? crypto.randomUUID(),
      name: dto.name ?? 'Portfolio',
      holdings,
      rebalanceFrequency: dto.rebalanceFrequency,
      rebalanceThreshold: dto.rebalanceThreshold,
      rebalanceOffset: dto.rebalanceOffset,
      rebalanceBands: dto.rebalanceBands,
      drag: dto.drag,
      totalReturn: dto.totalReturn,
      isGlidepath: dto.isGlidepath,
      glidepathFrom: dto.glidepathFrom,
      glidepathTo: dto.glidepathTo,
      glidepathYears: dto.glidepathYears,
      glidepathToWeights: dto.glidepathToWeights,
    });
  }

  /** 仅用于 domain 层内部构造或测试 */
  static create(
    id: string,
    name: string,
    holdings: PortfolioHolding[],
    config?: Partial<Pick<Portfolio, ConfigKeys>>,
  ): Portfolio {
    return new Portfolio({
      id,
      name,
      holdings,
      rebalanceFrequency: config?.rebalanceFrequency,
      rebalanceThreshold: config?.rebalanceThreshold,
      rebalanceOffset: config?.rebalanceOffset,
      rebalanceBands: config?.rebalanceBands,
      drag: config?.drag,
      totalReturn: config?.totalReturn,
      isGlidepath: config?.isGlidepath,
      glidepathFrom: config?.glidepathFrom,
      glidepathTo: config?.glidepathTo,
      glidepathYears: config?.glidepathYears,
      glidepathToWeights: config?.glidepathToWeights,
    });
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

  /**
   * 值对象在此处解包为原始值，是值对象生命周期的终点。
   * 替代独立的 buildEnginePortfolioBody() 函数，确保序列化逻辑与领域模型同源。
   */
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
            absolute: this.rebalanceBands.absoluteBand,
            relative: this.rebalanceBands.relativeBand,
          }
        : undefined,
      glidepathToWeights: this.isGlidepath ? this.glidepathToWeights : undefined,
      glidepathYears: this.isGlidepath ? this.glidepathYears : undefined,
    };
  }

  /**
   * application 层持久化时应使用此 DTO 而非原始请求体的 assets，
   * 确保落库数据与领域不变量一致（ADR-013）。
   */
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

type ConfigKeys =
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
