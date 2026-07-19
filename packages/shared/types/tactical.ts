// 战术分配（Tactical Allocation）类型定义

/** 技术指标类型 */
export type TechnicalIndicator = 'sma' | 'ema' | 'rsi' | 'macd' | 'bollinger' | 'momentum';

/**
 * 网格搜索参数范围（min/max/step 三元组）。
 *
 * 跨端契约：前端 tacticalGrid 表单构造 param1/param2，后端 GridSearchDomainRequest 接收，
 * 字段完全一致。上提到 shared 以消除前后端两份同构定义（原 backend `GridParamRange`
 * 与 frontend `ParamRange`）。
 */
export interface GridParamRange {
  /** 参数下界（含） */
  min: number;
  /** 参数上界（含） */
  max: number;
  /** 步长（必须 > 0；若 <= 0 则视为单点 [min, min]） */
  step: number;
}

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
