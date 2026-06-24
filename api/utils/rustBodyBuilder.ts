/**
 * Rust 引擎请求体构造工具
 *
 * 抽取自 backtestRoutes.ts 中重复的 Rust 请求体构造逻辑，
 * 将前端传入的 Portfolio / BacktestParameters 转换为 Rust 引擎所需的精简结构。
 */

import type {
  Portfolio,
  BacktestParameters,
} from '../../shared/types.js';

/**
 * 构造 Rust 引擎所需的组合（portfolio）对象。
 *
 * 从 Portfolio 中提取 Rust 引擎关注的字段，并按需转换 rebalanceBands、
 * glidepath 等高级配置。返回对象可直接作为 rustBody.portfolio 或
 * rustBody.portfolios[i] 使用。
 *
 * @param portfolio - 前端传入的投资组合
 * @returns Rust 引擎所需的组合对象，包含 name、assets、rebalanceFrequency、
 *          rebalanceThreshold、rebalanceOffset、drag、totalReturn、rebalanceBands、
 *          glidepathToWeights、glidepathYears 字段
 */
export function buildRustPortfolioBody(portfolio: Portfolio) {
  return {
    name: portfolio.name,
    assets: portfolio.assets.map(a => ({ ticker: a.ticker, weight: a.weight })),
    rebalanceFrequency: portfolio.rebalanceFrequency,
    rebalanceThreshold: portfolio.rebalanceThreshold,
    rebalanceOffset: portfolio.rebalanceOffset,
    drag: portfolio.drag,
    totalReturn: portfolio.totalReturn,
    rebalanceBands: portfolio.rebalanceBands?.enabled
      ? {
          absolute: portfolio.rebalanceBands.absoluteBand,
          relative: portfolio.rebalanceBands.relativeBand,
        }
      : undefined,
    glidepathToWeights: portfolio.isGlidepath ? portfolio.glidepathToWeights : undefined,
    glidepathYears: portfolio.isGlidepath ? portfolio.glidepathYears : undefined,
  };
}

/**
 * 构造 Rust 引擎所需的回测参数（params）对象。
 *
 * 从 BacktestParameters 中提取 Rust 引擎关注的字段，对可选字段提供默认值。
 * 返回对象可直接作为 rustBody.params 使用。
 *
 * 包含字段：startDate、endDate、startingValue、adjustForInflation、
 * rollingWindowMonths、benchmarkTicker、extendedWithdrawalStats、
 * cashflowLegs、oneTimeCashflows。
 *
 * @param parameters - 前端传入的回测参数
 * @returns Rust 引擎所需的参数对象
 */
export function buildRustParams(parameters: BacktestParameters) {
  return {
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    startingValue: parameters.startingValue,
    adjustForInflation: parameters.adjustForInflation,
    rollingWindowMonths: parameters.rollingWindowMonths,
    benchmarkTicker: parameters.benchmarkTicker,
    extendedWithdrawalStats: parameters.extendedWithdrawalStats ?? false,
    cashflowLegs: parameters.cashflowLegs ?? [],
    oneTimeCashflows: parameters.oneTimeCashflows ?? [],
  };
}
