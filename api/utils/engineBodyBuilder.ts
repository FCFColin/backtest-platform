/**
 * 引擎请求体构造工具
 *
 * 抽取自 backtestRoutes.ts 中重复的引擎请求体构造逻辑，
 * 将前端传入的 Portfolio / BacktestParameters 转换为 Go 引擎所需的精简结构。
 */

import type { Portfolio, BacktestParameters } from '../../shared/types.js';

/**
 * 构造引擎所需的组合（portfolio）对象。
 *
 * 从 Portfolio 中提取引擎关注的字段，并按需转换 rebalanceBands、
 * glidepath 等高级配置。返回对象可直接作为引擎请求体的 portfolio 或
 * portfolios[i] 字段使用。
 *
 * @param portfolio - 前端传入的投资组合
 * @returns 引擎所需的组合对象，包含 name、assets、rebalanceFrequency、
 *          rebalanceThreshold、rebalanceOffset、drag、totalReturn、rebalanceBands、
 *          glidepathToWeights、glidepathYears 字段
 */
export function buildEnginePortfolioBody(portfolio: Portfolio) {
  return {
    name: portfolio.name,
    assets: portfolio.assets.map((a) => ({ ticker: a.ticker, weight: a.weight })),
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
 * 构造引擎所需的回测参数（params）对象。
 *
 * 从 BacktestParameters 中提取引擎关注的字段，对可选字段提供默认值。
 * 返回对象可直接作为引擎请求体的 params 字段使用。
 *
 * 包含字段：startDate、endDate、startingValue、adjustForInflation、
 * rollingWindowMonths、benchmarkTicker、extendedWithdrawalStats、
 * cashflowLegs、oneTimeCashflows。
 *
 * @param parameters - 前端传入的回测参数
 * @returns 引擎所需的参数对象
 */
export function buildEngineParams(parameters: BacktestParameters) {
  // 引擎（engine-go）的 BacktestParams 将 startingValue / adjustForInflation /
  // rollingWindowMonths / benchmarkTicker 视为必填（非 Option，无 serde 默认）。
  // 这些字段在 schema 中为可选，前端省略时为 undefined，会被 JSON.stringify 丢弃，
  // 导致引擎反序列化报 "missing field" 并 400，进而每次回测都降级到 Node 备用引擎。
  // 因此在此处补齐引擎契约要求的默认值。
  return {
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    startingValue: parameters.startingValue ?? 10000,
    adjustForInflation: parameters.adjustForInflation ?? false,
    rollingWindowMonths: parameters.rollingWindowMonths ?? 12,
    benchmarkTicker: parameters.benchmarkTicker ?? '',
    extendedWithdrawalStats: parameters.extendedWithdrawalStats ?? false,
    cashflowLegs: parameters.cashflowLegs ?? [],
    oneTimeCashflows: parameters.oneTimeCashflows ?? [],
  };
}
