// 战术分配（Tactical Allocation）类型定义

/** 技术指标类型 */
export type TechnicalIndicator = 'sma' | 'ema' | 'rsi' | 'macd' | 'bollinger' | 'momentum';

/** 信号条件 */
export interface SignalCondition {
  indicator: TechnicalIndicator;
  period: number;
  operator: 'gt' | 'lt' | 'cross_above' | 'cross_below';
  threshold: number;
}

/** 交易信号 */
export interface TradingSignal {
  id: string;
  name: string;
  conditions: SignalCondition[];
  /** 组合切换目标权重 */
  targetWeights: Array<{ ticker: string; weight: number }>;
}

/** 战术分配策略 */
export interface TacticalStrategy {
  id: string;
  name: string;
  signals: TradingSignal[];
  /** 信号聚合方式 */
  aggregationMethod: 'weighted_average' | 'rank' | 'voting';
  /** 排名配置 */
  rankingConfig?: {
    method: 'fixed_share' | 'risk_parity';
    topN: number;
  };
}

/** What If 实时价格查询结果 */
export interface WhatIfResult {
  ticker: string;
  currentPrice: number;
  signalDate: string;
  signalType: 'buy' | 'sell' | 'hold';
}

/** 邮件告警配置 */
export interface EmailAlertConfig {
  enabled: boolean;
  email: string;
  triggers: Array<'signal_change' | 'rebalance' | 'threshold'>;
}
