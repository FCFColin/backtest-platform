/**
 * 组合相关类型定义
 *
 * 定义投资组合的结构、再平衡策略、现金流模型和货币类型。
 * 所有前端回测配置均基于此模块类型构建。
 */

/**
 * 单个资产的定义
 *
 * 注意：id 在新增时由前端生成临时 ID（crypto.randomUUID），
 * 仅用于列表 key 和拖拽排序；提交到后端时不传递 id。
 */
export interface Asset {
  id?: string;
  ticker: string;
  weight: number;
}

/** 再平衡触发频率 */
export type RebalanceFrequency =
  'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'none' | 'threshold';

/**
 * 再平衡偏离带配置
 *
 * 支持两种模式（互斥）：
 * 1. 对称模式：通过 absoluteBand（绝对偏离%）或 relativeBand（相对偏离%）设置对称偏离阈值
 * 2. 非对称模式：通过 upperBand/lowerBand 分别设置上限和下限偏离百分比
 * 非对称模式适用于对权重上偏和下偏有不同容忍度的策略（如单个资产上限限制）。
 */
export interface RebalanceBands {
  enabled: boolean;
  absoluteBand?: number;
  relativeBand?: number;
  upperBand?: number;
  lowerBand?: number;
}

/**
 * 投资组合定义
 *
 * drag：年化拖累率，用于模拟管理费、交易成本等持续损耗。
 * 例如 drag=0.5 表示每年从组合净值中额外扣除 0.5%。
 * 拖累是连续复利计算，每日按 (1+drag)^(1/252)-1 扣除。
 *
 * isGlidepath：滑行路径模式用于目标日期策略（如养老目标基金）。
 * 组合在 glidepathYears 年内从 glidepathFrom 的配置线性过渡到 glidepathTo。
 * glidepathToWeights 在目标组合资产与源组合资产顺序不一致时显式指定目标权重映射。
 *
 * totalReturn：启用后分红不提取而再投资，影响增长曲线计算。
 */
export interface Portfolio {
  id: string;
  name: string;
  assets: Asset[];
  rebalanceFrequency: RebalanceFrequency;
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

/** 现金流发生频率 */
export type CashflowFrequency = 'yearly' | 'monthly' | 'quarterly' | 'weekly';

/** 现金流方向：contribution 为投入，withdrawal 为提取 */
export type CashflowType = 'contribution' | 'withdrawal';

/** 现金流公共字段 */
export type CashflowBase = {
  id: string;
  amount: number;
  type: CashflowType;
};

/**
 * 周期性现金流腿
 *
 * 表示定期发生的投入或提取。例如每月定投 1000 元。
 * amount 始终为正数，方向由 type 决定。
 * offset 用于模拟不在周期末发生的现金流（如月中发薪月中定投）。
 * until 为空时表示在整个回测期间持续发生。
 */
export interface CashflowLeg extends CashflowBase {
  frequency: CashflowFrequency;
  offset: number;
  until?: string;
}

/** 一次性现金流，例如初始投入或中途的大额提取 */
export interface OneTimeCashflow extends CashflowBase {
  date: string;
}

/** 基础货币，决定通胀指数选择和货币符号显示 */
export type BaseCurrency = 'usd' | 'cny';
