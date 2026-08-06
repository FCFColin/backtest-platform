// 战术分配（Tactical Allocation）类型定义

export type TechnicalIndicator = 'sma' | 'ema' | 'rsi' | 'macd' | 'bollinger' | 'momentum';

export interface GridParamRange {
  min: number;
  max: number;
  step: number;
}

export interface SignalCondition {
  indicator: TechnicalIndicator;
  period: number;
  operator: 'gt' | 'lt' | 'cross_above' | 'cross_below';
  threshold: number;
}

export interface TradingSignal {
  id: string;
  name: string;
  conditions: SignalCondition[];
  targetWeights: Array<{ ticker: string; weight: number }>;
}

export interface TacticalStrategy {
  id: string;
  name: string;
  signals: TradingSignal[];
  aggregationMethod: 'weighted_average' | 'rank' | 'voting';
  rankingConfig?: {
    method: 'fixed_share' | 'risk_parity';
    topN: number;
  };
}

export interface WhatIfResult {
  ticker: string;
  currentPrice: number;
  signalDate: string;
  signalType: 'buy' | 'sell' | 'hold';
}
