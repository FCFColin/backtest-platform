export interface Asset {
  id?: string;
  ticker: string;
  weight: number;
}

export type RebalanceFrequency =
  'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'none' | 'threshold';

export interface RebalanceBands {
  enabled: boolean;
  absoluteBand?: number;
  relativeBand?: number;
  upperBand?: number;
  lowerBand?: number;
}

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
  tags?: string[];
}

/** 现金流频率 */
export type CashflowFrequency = 'yearly' | 'monthly' | 'quarterly' | 'weekly';

/** 现金流方向 */
export type CashflowType = 'contribution' | 'withdrawal';

/** 现金流公共字段 */

export type CashflowBase = {
  id: string;
  amount: number;
  type: CashflowType;
};

/** 周期性现金流腿 */
export interface CashflowLeg extends CashflowBase {
  frequency: CashflowFrequency;
  offset: number;
  until?: string;
}

/** 一次性现金流 */
export interface OneTimeCashflow extends CashflowBase {
  date: string;
}

/** 基础货币 */
export type BaseCurrency = 'usd' | 'cny';
