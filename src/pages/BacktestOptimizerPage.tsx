/**
 * @file 回测优化器页面
 * @description 遍历再平衡参数空间（频率 × 阈值 × 初始资金）运行回测，
 *              按优化目标排序，输出最优参数组合、对比表与收益曲线对比图。
 * @route /backtest-optimizer
 */
import { useOptimizerState } from './backtestOptimizerUtils.js';
import { OptimizerPageShell } from './backtestOptimizerComponents.js';

export default function BacktestOptimizerPage() {
  const s = useOptimizerState();
  return <OptimizerPageShell s={s} />;
}
