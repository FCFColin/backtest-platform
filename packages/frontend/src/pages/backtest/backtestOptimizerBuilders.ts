import type {
  RebalanceFrequency,
  BacktestOptimizerObjective as Objective,
  BestResultItem,
} from '@backtest/shared';
import { fmtPct, fmtNum, fmtDollar } from '@/utils/format';
import { FREQ_LABELS } from './backtestOptimizerConstants.js';

/**
 * 构建回测优化器 POST /optimize 请求体。
 *
 * @param validAssets  已校验的资产列表（ticker 与权重字符串）
 * @param frequencies  待扫描的再平衡频率集合
 * @param range        阈值与初始资金的扫描区间
 * @param dates        回测起止日期与基准 ticker
 * @param config       优化目标与可选约束（最大回撤 / 最小 CAGR）
 * @returns            可直接 POST 给后端的请求体对象
 */
export function buildOptimizeBody(
  validAssets: Array<{ ticker: string; weight: string }>,
  frequencies: RebalanceFrequency[],
  range: {
    thrMin: string;
    thrMax: string;
    thrStep: string;
    capMin: string;
    capMax: string;
    capStep: string;
  },
  dates: { startDate: string; endDate: string; benchmarkTicker: string },
  config: {
    objective: Objective;
    enableMaxDD: boolean;
    maxDD: string;
    enableMinCagr: boolean;
    minCagr: string;
  },
): Record<string, unknown> {
  const c: Record<string, number> = {};
  if (config.enableMaxDD && config.maxDD !== '') c.maxDrawdown = Number(config.maxDD);
  if (config.enableMinCagr && config.minCagr !== '') c.minCagr = Number(config.minCagr);
  return {
    portfolio: {
      assets: validAssets.map((a) => ({
        ticker: a.ticker.trim().toUpperCase(),
        weight: Number(a.weight) || 0,
      })),
    },
    parameterSpace: {
      rebalanceFrequencies: frequencies,
      rebalanceThreshold: {
        min: Number(range.thrMin),
        max: Number(range.thrMax),
        step: Number(range.thrStep),
      },
      initialCapital: {
        min: Number(range.capMin),
        max: Number(range.capMax),
        step: Number(range.capStep),
      },
    },
    parameters: {
      startDate: dates.startDate,
      endDate: dates.endDate,
      benchmarkTicker: dates.benchmarkTicker.trim().toUpperCase(),
      baseCurrency: 'usd',
      adjustForInflation: false,
    },
    objective: config.objective,
    constraints: c,
  };
}

/**
 * 合并最优组合增长曲线与基准增长曲线为图表数据。
 *
 * @param best            最优组合（含 growthCurve），为 null 时返回空数组
 * @param benchmarkGrowth 基准增长曲线，为 null 时仅返回组合曲线
 * @returns               按 date 升序排列的合并数据点
 */
export function buildChartData(
  best: BestResultItem | null,
  benchmarkGrowth: Array<{ date: string; value: number }> | null,
): Array<{ date: string; portfolio: number; benchmark?: number }> {
  if (!best?.growthCurve) return [];
  const map = new Map<string, { date: string; portfolio: number; benchmark?: number }>();
  for (const p of best.growthCurve) map.set(p.date, { date: p.date, portfolio: p.value });
  if (benchmarkGrowth) {
    for (const p of benchmarkGrowth) {
      const entry = map.get(p.date);
      if (entry) entry.benchmark = p.value;
      else map.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 构建最优组合关键指标展示卡片所需的 label/value 列表。
 *
 * @param best 最优组合，为 null 时返回空数组
 * @returns    按展示顺序排列的指标键值对
 */
export function buildBestMetrics(
  best: BestResultItem | null,
): Array<{ label: string; value: string }> {
  if (!best) return [];
  return [
    {
      label: '再平衡频率',
      value:
        best.rebalanceFrequency === 'threshold'
          ? `阈值(${best.rebalanceThreshold}%)`
          : (FREQ_LABELS[best.rebalanceFrequency] ?? best.rebalanceFrequency),
    },
    { label: '初始资金', value: fmtDollar(best.initialCapital) },
    { label: 'CAGR', value: fmtPct(best.cagr) },
    { label: '最大回撤', value: fmtPct(best.maxDrawdown) },
    { label: '波动率', value: fmtPct(best.stdev) },
    { label: 'Sharpe', value: fmtNum(best.sharpe) },
    { label: 'Sortino', value: fmtNum(best.sortino) },
    { label: 'Calmar', value: fmtNum(best.calmar) },
  ];
}
