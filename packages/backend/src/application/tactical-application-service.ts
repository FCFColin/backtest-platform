/**
 * 战术分配应用服务（T-30 / CQRS Command）
 *
 * 路由层经此服务调用引擎，避免路由直接 import api/engine/*。
 */
import type { TacticalStrategy, EmailAlertConfig } from '@backtest/shared/types/tactical';
import type { Portfolio, RebalanceFrequency, PortfolioResult } from '@backtest/shared/types/index';
import {
  collectTickers,
  runTacticalBacktest,
  computeSimpleStatistics,
  analyzeWhatIf,
} from '../engine/tactical.js';

export { collectTickers };
import { runPortfolioBacktest } from '../engine/backtestRunner.js';
import { logger } from '../utils/logger.js';

export interface TacticalBacktestRequest {
  strategy: TacticalStrategy;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
}

export interface TacticalBacktestResult {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}

/**
 * 运行战术分配回测（含等权基准）。
 *
 * @param priceData - 已获取的历史价格
 * @throws Error 无效标的或交易日不足
 */
export function executeTacticalBacktest(
  req: TacticalBacktestRequest,
  priceData: Record<string, Record<string, number>>,
): TacticalBacktestResult {
  const { strategy, startDate, endDate, startingValue, rebalanceFrequency } = req;
  const allTickers = collectTickers(strategy);

  const invalidTickers = allTickers.filter(
    (t) => !priceData[t] || Object.keys(priceData[t]).length === 0,
  );
  if (invalidTickers.length > 0) {
    throw new Error(`以下标的代码无效：${invalidTickers.join(', ')}`);
  }

  const dateSet = new Set<string>();
  for (const ticker of allTickers) {
    for (const date of Object.keys(priceData[ticker])) dateSet.add(date);
  }
  const dates = Array.from(dateSet)
    .sort()
    .filter((d) => d >= startDate && d <= endDate);
  if (dates.length < 2) {
    throw new Error('有效交易日不足，无法运行回测');
  }

  const { result: tacticalResult, signalHistory } = runTacticalBacktest(
    strategy,
    priceData,
    dates,
    startingValue,
    rebalanceFrequency,
  );

  const benchmarkPortfolio: Portfolio = {
    id: 'tactical-benchmark',
    name: '等权基准',
    assets: allTickers.map((t) => ({ ticker: t, weight: 100 / allTickers.length })),
    rebalanceFrequency,
  };
  const benchmarkParams = {
    startDate,
    endDate,
    startingValue,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    cashflowLegs: [],
    oneTimeCashflows: [],
  };

  let benchmarkResult: PortfolioResult;
  try {
    const btResult = runPortfolioBacktest([benchmarkPortfolio], priceData, benchmarkParams);
    benchmarkResult = btResult.portfolios[0];
  } catch (err) {
    logger.warn(`[tactical] 基准回测失败，使用空结果: ${(err as Error).message}`);
    benchmarkResult = {
      name: '等权基准',
      growthCurve: [],
      drawdownCurve: [],
      rollingReturns: [],
      annualReturns: [],
      monthlyReturns: [],
      statistics: computeSimpleStatistics([], startingValue),
    };
  }

  return { portfolio: tacticalResult, benchmark: benchmarkResult, signalHistory };
}

/**
 * What-if 实时价格与信号状态分析。
 */
export function executeTacticalWhatIf(
  tickers: string[],
  strategy: TacticalStrategy,
  priceData: Record<string, Record<string, number>>,
  endDate: string,
) {
  return analyzeWhatIf(tickers, strategy, priceData, endDate);
}

/**
 * 校验并接受战术告警配置。
 *
 * RO-055：原实现将配置暂存于模块级 `alertConfigStore`，但该状态从未被任何消费方
 * （邮件发送 scheduler/cron）读取，属于未上线的死写入。删除模块级可变状态以消除
 * 多实例不一致风险；函数签名保留以维持路由契约，仅做参数校验。
 * 未来若上线真实告警发送，应改为 Redis 持久化（ADR-018）。
 */
export function saveTacticalAlertConfig(config: EmailAlertConfig): EmailAlertConfig {
  if (config.enabled && !config.email) {
    throw new Error('启用告警时必须填写邮箱');
  }
  return config;
}
