// Package engineutil 提供回测引擎的共享纯函数工具集（叶子包，不依赖 engine/tactical）。
//
// 本文件收口年化与无风险利率相关常量，避免 engine/signal/letf/goaloptimizer/
// optimizer/tactical 各自维护 252 / 0.02 副本导致数值漂移风险。
package engineutil

// TradingDaysPerYear 年交易日数，用于年化波动率/收益等指标。
// 采用 untyped float constant，既可参与浮点年化计算，也可在调用方
// 显式转换为整型（如统计窗口换算）。历史各包副本均为 252.0。
const TradingDaysPerYear = 252.0

// RiskFreeRate 默认无风险利率，用于夏普比率等风险调整收益指标。
// 各包历史副本均为 0.02（2%）。
const RiskFreeRate = 0.02