/**
 * 引擎请求体构造工具
 *
 * buildEnginePortfolioBody() 已移除 — 组合序列化逻辑统一由 Portfolio 聚合根的
 * toEngineBody() 方法承担，确保序列化与领域模型同源（ADR-013 DDD 实用化）。
 *
 * 本模块仅保留 buildEngineParams()，因为 BacktestParameters 是共享层 DTO（非领域聚合根），
 * 其引擎序列化逻辑没有领域行为可封装。
 */

import type { BacktestParameters } from '@backtest/shared/types';

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
  // 导致引擎反序列化报 "missing field" 并 400。因此在此处补齐引擎契约要求的默认值。
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
