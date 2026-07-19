// DDD: Portfolio Aggregate — 事务边界 + 业务规则
//
// 充血模型：组合聚合根封装了权重校验、持仓管理、集中度分析、再平衡判断等业务逻辑。
// 携带完整配置（再平衡策略、拖累、滑行路径），是 application service 的标准输入类型。
// application 层通过 fromDTO() 从请求 DTO 构造聚合根，通过 toEngineBody() 序列化为引擎请求体，
// 整个流程中值对象（Ticker/Weight）始终保留，不再中途丢弃。

import { Ticker } from '../value-objects/ticker.js';
import { Weight } from '../value-objects/weight.js';
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

/** 组合权重和容差（百分比点） */
const PORTFOLIO_WEIGHT_SUM_TOLERANCE = 1;

/** 单一持仓集中度阈值（百分比），超过此值视为高集中度 */
export const CONCENTRATION_THRESHOLD = 40;

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
   * 从共享层 DTO 构造聚合根。
   *
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

  /** 低级工厂：仅用于 domain 层内部构造或测试 */
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

  getHoldings(): ReadonlyArray<PortfolioHolding> {
    return Object.freeze([...this.holdings]);
  }

  /** 持仓数量 */
  get holdingCount(): number {
    return this.holdings.length;
  }

  /** 所有持仓的 ticker 列表 */
  get tickers(): string[] {
    return this.holdings.map((h) => h.ticker.value);
  }

  /** 权重总和 */
  get totalWeight(): number {
    return this.holdings.reduce((acc, h) => acc + h.weight.value, 0);
  }

  /** 最大单一持仓权重 */
  get maxWeight(): number {
    return this.holdings.reduce((max, h) => Math.max(max, h.weight.value), 0);
  }

  /** 是否高集中度（任一持仓超过阈值） */
  get isConcentrated(): boolean {
    return this.maxWeight > CONCENTRATION_THRESHOLD;
  }

  /** 查找指定 ticker 的持仓 */
  findHolding(ticker: Ticker): PortfolioHolding | undefined {
    return this.holdings.find((h) => h.ticker.equals(ticker));
  }

  addHolding(holding: PortfolioHolding): Portfolio {
    return Portfolio.create(this.id, this.name, [...this.holdings, holding], this.configSnapshot);
  }

  removeHolding(ticker: Ticker): Portfolio {
    const newHoldings = this.holdings.filter((h) => !h.ticker.equals(ticker));
    return Portfolio.create(this.id, this.name, newHoldings, this.configSnapshot);
  }

  /** 调整持仓权重（返回新 Portfolio，原对象不可变） */
  rebalance(targetWeights: Map<string, number>): Portfolio {
    const newHoldings = this.holdings.map((h) => {
      const target = targetWeights.get(h.ticker.value);
      if (target === undefined) {
        throw new Error(`No target weight for ticker: ${h.ticker.value}`);
      }
      return { ticker: h.ticker, weight: Weight.create(target) };
    });
    return Portfolio.create(this.id, this.name, newHoldings, this.configSnapshot);
  }

  /** 检查是否需要再平衡（任一持仓偏离目标超过阈值） */
  needsRebalance(targetWeights: Map<string, number>, threshold: number): boolean {
    return this.holdings.some((h) => {
      const target = targetWeights.get(h.ticker.value);
      if (target === undefined) return true;
      return Math.abs(h.weight.value - target) > threshold;
    });
  }

  /**
   * 序列化为 Go 引擎请求体格式。
   *
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
   * 序列化为持久化层 DTO（与 portfolios 表 schema 对齐）。
   *
   * 值对象在此处解包为原始值，资产列表已经过聚合根构造时的净化与校验，
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

  /** 获取当前配置快照（用于不可变更新时保留配置） */
  private get configSnapshot(): Partial<Pick<Portfolio, ConfigKeys>> {
    return {
      rebalanceFrequency: this.rebalanceFrequency,
      rebalanceThreshold: this.rebalanceThreshold,
      rebalanceOffset: this.rebalanceOffset,
      rebalanceBands: this.rebalanceBands,
      drag: this.drag,
      totalReturn: this.totalReturn,
      isGlidepath: this.isGlidepath,
      glidepathFrom: this.glidepathFrom,
      glidepathTo: this.glidepathTo,
      glidepathYears: this.glidepathYears,
      glidepathToWeights: this.glidepathToWeights,
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
