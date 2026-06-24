// 组合相关类型定义

/** 资产定义 */
export interface Asset {
  id?: string;
  ticker: string;
  weight: number;
}

/** 再平衡频率 */
export type RebalanceFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'none' | 'threshold';

/** 再平衡偏离带类型 */
export interface RebalanceBands {
  enabled: boolean;
  absoluteBand?: number; // 绝对偏离百分比，如5表示偏离5%时触发
  relativeBand?: number; // 相对偏离百分比
  // 非对称带（上限/下限可分别设置，与 absoluteBand/relativeBand 对称模式互斥）
  upperBand?: number; // 上限偏离百分比，权重上偏超过该值时触发调仓
  lowerBand?: number; // 下限偏离百分比，权重下偏超过该值时触发调仓
}

/** 投资组合 */
export interface Portfolio {
  id: string;
  name: string;
  assets: Asset[];
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number; // 偏离调仓阈值（百分比），如 5 表示偏离 5% 时调仓，仅 threshold 模式有效
  rebalanceOffset?: number; // 调仓偏移（交易日），从周期末向前偏移
  rebalanceBands?: RebalanceBands; // 再平衡偏离带
  drag?: number; // 年化拖累（百分比），如0.5表示每年额外扣除0.5%
  totalReturn?: boolean; // 是否将分红再投资（Total return模式）
  isGlidepath?: boolean; // 是否为滑行路径组合
  glidepathFrom?: string; // 滑行路径源组合ID
  glidepathTo?: string; // 滑行路径目标组合ID
  glidepathYears?: number; // 滑行路径过渡年限
  glidepathToWeights?: number[]; // 滑行路径目标权重（小数形式，与assets一一对应）
}

/** 现金流频率 */
export type CashflowFrequency = 'yearly' | 'monthly' | 'quarterly' | 'weekly';

/** 现金流类型 */
export type CashflowType = 'contribution' | 'withdrawal';

/** 周期性现金流腿 */
export interface CashflowLeg {
  id: string;
  amount: number; // 正数
  type: CashflowType; // 投入或提取
  frequency: CashflowFrequency;
  offset: number; // 从周期末偏移的交易日数
  until?: string; // 结束日期，空表示持续到回测结束
}

/** 一次性现金流 */
export interface OneTimeCashflow {
  id: string;
  amount: number;
  type: CashflowType;
  date: string; // 发生日期
}

/** 基础货币 */
export type BaseCurrency = 'usd' | 'cny';
