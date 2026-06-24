/**
 * 回测优化器路由
 *
 * 遍历参数空间（再平衡频率 × 阈值 × 初始资金）运行组合回测，
 * 按优化目标排序返回全部结果及最优组合的收益曲线。
 *
 * POST /api/backtest-optimizer/optimize
 */
import { Router, type Request, type Response } from 'express';
import type {
  Portfolio,
  BacktestParameters,
  RebalanceFrequency,
} from '../../shared/types.js';
import { runPortfolioBacktest } from '../engine/portfolio.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { backtestOptimizerSchema } from '../schemas/backtestOptimizer.js';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';

const router = Router();

/** 优化目标 */
type Objective = 'maxCagr' | 'minMaxDrawdown' | 'maxSharpe' | 'maxSortino';

/** 单个参数组合的回测结果 */
interface OptimizeResultItem {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  stdev: number;
  calmar: number;
}

/** 带收益曲线的结果（仅最优组合） */
interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}

/** 请求体 */
interface OptimizeRequest {
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
  objective: Objective;
  constraints?: {
    maxDrawdown?: number; // 百分比，如 20 表示 20%
    minCagr?: number; // 百分比
  };
}

/** 参数组合总数安全上限 */
const MAX_COMBINATIONS = 1000;

/**
 * 生成等差数列（含端点，浮点安全）。
 * step <= 0 或 min > max 时仅返回 [min]。
 */
function range(min: number, max: number, step: number): number[] {
  if (step <= 0 || min > max) return [min];
  const arr: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    arr.push(Math.round(v * 100) / 100);
  }
  return arr;
}

/** 构建回测参数（填充默认值） */
function buildBacktestParameters(
  parameters: OptimizeRequest['parameters'],
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
 * 执行参数优化核心逻辑（供 Worker 和同步回退共用）
 *
 * Architecture: 提取为独立函数，Worker进程和同步回退路径共用同一逻辑
 * 企业为何需要：避免代码重复，确保异步和同步路径结果一致
 */
export async function executeOptimization(body: Record<string, unknown>): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const startTime = Date.now();
  const { portfolio, parameterSpace, parameters, objective, constraints } =
    body as unknown as OptimizeRequest;

  // ===== 参数校验 =====
  if (!portfolio?.assets || portfolio.assets.length === 0) {
    return { success: false, error: '缺少组合配置：portfolio.assets' };
  }
  if (!parameterSpace?.rebalanceFrequencies?.length) {
    return { success: false, error: '请至少选择一个再平衡频率' };
  }
  if (!parameters?.startDate || !parameters?.endDate) {
    return { success: false, error: '缺少回测日期范围' };
  }

  // ===== 获取价格数据 =====
  const allTickers = new Set<string>();
  for (const a of portfolio.assets) allTickers.add(a.ticker);
  if (parameters.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);

  const priceData = await fetchHistoryData(
    Array.from(allTickers),
    parameters.startDate,
    parameters.endDate,
  );

  // 检查无效 ticker
  const invalidTickers: string[] = [];
  for (const t of allTickers) {
    if (!priceData[t] || Object.keys(priceData[t]).length === 0) {
      invalidTickers.push(t);
    }
  }
  if (invalidTickers.length > 0) {
    return { success: false, error: `以下标的代码无效：${invalidTickers.join(', ')}` };
  }

  // ===== 生成参数组合 =====
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

  interface Combo {
    frequency: RebalanceFrequency;
    threshold?: number;
    capital: number;
  }
  const combos: Combo[] = [];

  // 选中的频率 × 初始资金
  for (const freq of parameterSpace.rebalanceFrequencies) {
    for (const cap of capitals) {
      combos.push({ frequency: freq, capital: cap });
    }
  }
  // 阈值频率 × 初始资金（仅当提供了阈值范围时）
  if (thresholds.length > 0) {
    for (const thr of thresholds) {
      for (const cap of capitals) {
        combos.push({ frequency: 'threshold', threshold: thr, capital: cap });
      }
    }
  }

  if (combos.length === 0) {
    return { success: false, error: '参数空间为空，请检查范围与步长' };
  }
  if (combos.length > MAX_COMBINATIONS) {
    return { success: false, error: `参数组合数 ${combos.length} 超过上限 ${MAX_COMBINATIONS}，请缩小参数空间` };
  }

  logger.info(
    `[backtest-optimizer] 开始优化：${combos.length} 个组合，目标=${objective}`,
  );

  // ===== 按初始资金分组批量回测 =====
  const byCapital = new Map<number, Combo[]>();
  for (const c of combos) {
    if (!byCapital.has(c.capital)) byCapital.set(c.capital, []);
    byCapital.get(c.capital)!.push(c);
  }

  const items: OptimizeResultItem[] = [];
  // 按初始资金缓存基准收益曲线（基准按 startingValue 缩放）
  const benchmarkByCapital = new Map<
    number,
    Array<{ date: string; value: number }>
  >();

  for (const [capital, group] of byCapital) {
    const portfolios: Portfolio[] = group.map((c, idx) => ({
      id: `opt-${idx}`,
      name:
        c.frequency === 'threshold'
          ? `threshold-${c.threshold}`
          : c.frequency,
      assets: portfolio.assets.map((a) => ({ ticker: a.ticker, weight: a.weight })),
      rebalanceFrequency: c.frequency,
      rebalanceThreshold: c.threshold,
      rebalanceOffset: 0,
      drag: 0,
      totalReturn: true,
    }));
    const btParams = buildBacktestParameters(parameters, capital);
    const btResult = runPortfolioBacktest(portfolios, priceData, btParams);

    if (btResult.benchmarkGrowth) {
      benchmarkByCapital.set(capital, btResult.benchmarkGrowth);
    }

    for (let j = 0; j < group.length; j++) {
      const stats = btResult.portfolios[j].statistics;
      items.push({
        rebalanceFrequency: group[j].frequency,
        rebalanceThreshold: group[j].threshold,
        initialCapital: capital,
        cagr: stats.cagr,
        maxDrawdown: stats.maxDrawdown,
        sharpe: stats.sharpe,
        sortino: stats.sortino,
        stdev: stats.stdev,
        calmar: stats.calmar ?? 0,
      });
    }
  }

  // ===== 应用约束过滤 =====
  let filtered = items;
  if (constraints) {
    filtered = items.filter((it) => {
      if (
        constraints.maxDrawdown !== undefined &&
        it.maxDrawdown > constraints.maxDrawdown / 100
      )
        return false;
      if (
        constraints.minCagr !== undefined &&
        it.cagr < constraints.minCagr / 100
      )
        return false;
      return true;
    });
  }

  // ===== 按目标排序 =====
  const objectiveValue = (it: OptimizeResultItem): number => {
    switch (objective) {
      case 'maxCagr':
        return it.cagr;
      case 'minMaxDrawdown':
        return -it.maxDrawdown; // 回撤越小越好 → 取负后越大越好
      case 'maxSharpe':
        return it.sharpe;
      case 'maxSortino':
        return it.sortino;
      default:
        return it.cagr;
    }
  };
  filtered.sort((a, b) => objectiveValue(b) - objectiveValue(a));

  // ===== 最优组合：附带收益曲线 =====
  let best: BestResultItem | null = null;
  let benchmarkGrowth: Array<{ date: string; value: number }> | null = null;

  if (filtered.length > 0) {
    const bestItem = filtered[0];
    // 从对应初始资金的批次中重新获取收益曲线
    const bestPortfolios: Portfolio[] = [
      {
        id: 'best',
        name: '最优组合',
        assets: portfolio.assets.map((a) => ({
          ticker: a.ticker,
          weight: a.weight,
        })),
        rebalanceFrequency: bestItem.rebalanceFrequency,
        rebalanceThreshold: bestItem.rebalanceThreshold,
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ];
    const bestResult = runPortfolioBacktest(
      bestPortfolios,
      priceData,
      buildBacktestParameters(parameters, bestItem.initialCapital),
    );
    best = {
      ...bestItem,
      growthCurve: bestResult.portfolios[0].growthCurve,
    };
    benchmarkGrowth = bestResult.benchmarkGrowth || null;
  }

  logger.info(
    `[backtest-optimizer] 优化完成：${combos.length} 组合，${filtered.length} 通过过滤，耗时 ${Date.now() - startTime}ms`,
  );

  return {
    success: true,
    data: {
      results: filtered,
      best,
      benchmarkGrowth,
      totalCombinations: combos.length,
    },
  };
}

/**
 * POST /api/backtest-optimizer/optimize
 *
 * 接收参数空间和优化目标，遍历参数组合运行回测，返回排序后的结果。
 */
router.post('/optimize', validate(backtestOptimizerSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    // Architecture: 异步任务提交，立即返回202
    // 企业为何需要：参数优化1000组合同步执行需30-100s，阻塞事件循环
    // 权衡：客户端需轮询获取结果，但系统整体吞吐量大幅提升
    try {
      const job = await backtestQueue.add('optimizer', {
        type: 'optimizer',
        payload: req.body,
      } as BacktestJobData);

      res.status(202).json({
        type: 'https://httpstatuses.com/202',
        title: 'Accepted',
        status: 202,
        detail: 'Optimization task submitted',
        jobId: job.id,
        statusUrl: `/api/v1/jobs/${job.id}`,
      });
      return;
    } catch (queueError) {
      // Redis不可用时回退到同步执行
      logger.warn({ error: (queueError as Error).message }, '[backtest-optimizer] BullMQ不可用，回退到同步执行');
    }

    // 同步回退：Redis不可用时直接执行
    const result = await executeOptimization(req.body as Record<string, unknown>);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ err: error as Error }, 'Backtest optimizer error');
    res.status(500).json({ success: false, error: 'Failed to run backtest optimization' });
  }
});

export default router;
