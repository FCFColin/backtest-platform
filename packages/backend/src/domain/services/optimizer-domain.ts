/**
 * 回测优化器纯领域逻辑（RO-054 拆分）
 *
 * 将原 optimizer application service 中的无副作用纯函数、类型与常量抽离到 domain 层，
 * 使其可在不依赖引擎/数据服务的情况下被单元测试与复用。application-service 仅保留
 * 编排入口（fetchHistoryData + callEngineStrict + 上述纯函数的串联）。
 *
 * 企业理由（ADR-013 DDD 分层）：领域逻辑不应与 I/O 耦合，拆分后可独立测试、
 * 减少重构时对编排层的连带修改。
 */
import type {
  BacktestParameters,
  RebalanceFrequency,
  BacktestOptimizerObjective,
  OptimizeResultItem,
  BestResultItem,
} from '@backtest/shared/types';
import { numericRange } from '../../utils/numericRange.js';

/**
 * 回测优化器请求体（领域契约）。
 *
 * 与 schemas/optimizer.ts 中的 Zod schema 对应：domain 定义类型契约，
 * schemas 提供 Zod 运行时校验（依赖方向 schemas -> domain，符合六边形架构）。
 */
export interface BacktestOptimizerRequest {
  portfolio: {
    name?: string;
    assets: Array<{ ticker: string; weight: number }>;
  };
  parameterSpace: {
    rebalanceFrequencies: RebalanceFrequency[];
    rebalanceThreshold?: { min: number; max: number; step: number };
    initialCapital: { min: number; max: number; step: number };
  };
  parameters: {
    startDate: string;
    endDate: string;
    benchmarkTicker?: string;
    baseCurrency?: 'usd' | 'cny';
    adjustForInflation?: boolean;
  };
  objective: BacktestOptimizerObjective;
  constraints?: { maxDrawdown?: number; minCagr?: number };
}
// OptimizeResultItem / BestResultItem 已上提到 shared/types/optimizer.ts，
// 这里 re-export 以保持 application 层既有导入路径不变。
export type { OptimizeResultItem, BestResultItem };

/** 参数组合（频率+阈值+资金） */
export interface Combo {
  frequency: RebalanceFrequency;
  threshold?: number;
  capital: number;
}

/** 参数组合数硬上限（防止滥用引擎算力） */
export const MAX_OPTIMIZER_COMBINATIONS = 1000;

/**
 * 生成等差数值序列（包装 numericRange，固定 2 位小数精度）。
 *
 * @param min - 起始值
 * @param max - 结束值（含）
 * @param step - 步长
 * @returns 数值数组
 */
export function range(min: number, max: number, step: number): number[] {
  return numericRange(min, max, step, 2);
}

/**
 * 构造回测参数对象（补齐默认值）。
 *
 * @param parameters - 请求中的参数子集
 * @param startingValue - 起始资金
 * @returns 完整的 BacktestParameters 对象
 */
export function buildBacktestParameters(
  parameters: BacktestOptimizerRequest['parameters'],
  startingValue: number,
): BacktestParameters {
  return {
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    startingValue,
    baseCurrency: parameters.baseCurrency || 'usd',
    adjustForInflation: parameters.adjustForInflation ?? false,
    rollingWindowMonths: 12,
    benchmarkTicker: parameters.benchmarkTicker || '',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
}

/**
 * 验证优化请求参数。
 *
 * @param body - 已通过 schema 校验的请求体
 * @returns 错误消息或 null（表示通过）
 */
export function validateOptimizeRequest(body: BacktestOptimizerRequest): string | null {
  if (!body.portfolio?.assets || body.portfolio.assets.length === 0) {
    return '缺少组合配置：portfolio.assets';
  }
  if (!body.parameterSpace?.rebalanceFrequencies?.length) {
    return '请至少选择一个再平衡频率';
  }
  if (!body.parameters?.startDate || !body.parameters?.endDate) {
    return '缺少回测日期范围';
  }
  return null;
}

/**
 * 构建参数组合列表（频率 × 资金 + 阈值 × 资金）。
 *
 * @param parameterSpace - 参数空间
 * @returns Combo 数组
 */
export function buildCombinations(
  parameterSpace: BacktestOptimizerRequest['parameterSpace'],
): Combo[] {
  const capitals = range(
    parameterSpace.initialCapital.min,
    parameterSpace.initialCapital.max,
    parameterSpace.initialCapital.step,
  );
  const thresholds = parameterSpace.rebalanceThreshold
    ? range(
        parameterSpace.rebalanceThreshold.min,
        parameterSpace.rebalanceThreshold.max,
        parameterSpace.rebalanceThreshold.step,
      )
    : [];

  const combos: Combo[] = [];
  for (const freq of parameterSpace.rebalanceFrequencies) {
    for (const cap of capitals) {
      combos.push({ frequency: freq, capital: cap });
    }
  }
  if (thresholds.length > 0) {
    for (const thr of thresholds) {
      for (const cap of capitals) {
        combos.push({ frequency: 'threshold', threshold: thr, capital: cap });
      }
    }
  }
  return combos;
}

/**
 * 按约束过滤结果。
 *
 * @param items - 待过滤结果列表
 * @param constraints - 约束条件（maxDrawdown/minCagr 以百分比表示）
 * @returns 通过约束的结果列表
 */
export function filterByConstraints(
  items: OptimizeResultItem[],
  constraints?: BacktestOptimizerRequest['constraints'],
): OptimizeResultItem[] {
  if (!constraints) return items;
  return items.filter((it) => {
    if (constraints.maxDrawdown !== undefined && it.maxDrawdown > constraints.maxDrawdown / 100)
      return false;
    if (constraints.minCagr !== undefined && it.cagr < constraints.minCagr / 100) return false;
    return true;
  });
}

/**
 * 计算目标函数值（数值越大越优）。
 *
 * @param it - 结果项
 * @param objective - 优化目标
 * @returns 目标函数值
 */
export function objectiveValue(
  it: OptimizeResultItem,
  objective: BacktestOptimizerObjective,
): number {
  switch (objective) {
    case 'maxCagr':
      return it.cagr;
    case 'minMaxDrawdown':
      return -it.maxDrawdown;
    case 'maxSharpe':
      return it.sharpe;
    case 'maxSortino':
      return it.sortino;
    default:
      return it.cagr;
  }
}
