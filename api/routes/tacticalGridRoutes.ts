/**
 * @file 战术网格搜索（Tactical Grid Search）路由
 * @description 遍历参数网格（笛卡尔积），对每个参数组合计算信号并运行回测，
 *              按优化目标排序返回 Top N 结果与热力图数据矩阵。
 *
 * 路由层仅负责：参数校验、调用引擎、响应包装
 * 核心算法见 api/engine/tacticalGrid.ts
 *
 * 路由：
 * - POST /api/tactical-grid/search — 接收参数网格定义，遍历所有参数组合运行回测，返回排序结果
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { validate } from '../middleware/validate.js';
import { tacticalGridSearchSchema } from '../schemas/tacticalGrid.js';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import {
  runGridSearch,
  type TacticalGridRequest,
} from '../engine/tacticalGrid.js';

const router = Router();

/** 参数组合总数安全上限 */
const MAX_GRID_COMBINATIONS = 200;

/**
 * 执行网格搜索核心逻辑（供 Worker 和同步回退共用）
 *
 * Architecture: 提取为独立函数，Worker进程和同步回退路径共用同一逻辑
 * 企业为何需要：避免代码重复，确保异步和同步路径结果一致
 */
export async function executeGridSearch(body: Record<string, unknown>): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const startTime = Date.now();
  const request = body as unknown as TacticalGridRequest;

  // ===== 参数校验 =====
  if (!request.indicator || !request.param1 || !request.param2) {
    return { success: false, error: '缺少必要参数: indicator, param1, param2' };
  }
  if (!request.tickers || request.tickers.length === 0) {
    return { success: false, error: '请至少输入一个标的代码' };
  }
  if (!request.startDate || !request.endDate) {
    return { success: false, error: '缺少起止日期' };
  }

  const { indicator, param1: param1Range, param2: param2Range, tickers, startDate, endDate, objective } = request;

  logger.info(
    `[tactical-grid] 开始网格搜索: indicator=${indicator}, ticker=${sanitizeLog(tickers[0])}, objective=${objective}`,
  );

  // 1. 生成参数网格（笛卡尔积）— 在引擎中完成，此处仅做上限校验
  const param1Values: number[] = [];
  if (param1Range.step > 0) {
    for (let v = param1Range.min; v <= param1Range.max + 1e-9; v += param1Range.step) {
      param1Values.push(Math.round(v * 1000) / 1000);
    }
  } else {
    param1Values.push(param1Range.min);
  }
  const param2Values: number[] = [];
  if (param2Range.step > 0) {
    for (let v = param2Range.min; v <= param2Range.max + 1e-9; v += param2Range.step) {
      param2Values.push(Math.round(v * 1000) / 1000);
    }
  } else {
    param2Values.push(param2Range.min);
  }
  const totalCombinations = param1Values.length * param2Values.length;

  logger.info(
    `[tactical-grid] 参数网格: param1=${param1Values.length}个, param2=${param2Values.length}个, 共${totalCombinations}个组合`,
  );

  if (totalCombinations > MAX_GRID_COMBINATIONS) {
    return {
      success: false,
      error: `参数组合过多(${totalCombinations})，请缩小参数范围（上限${MAX_GRID_COMBINATIONS}）`,
    };
  }

  // 2. 获取价格数据（使用第一个 ticker 作为交易标的）
  const tradingTicker = tickers[0].toUpperCase();
  const priceData = await fetchHistoryData([tradingTicker], startDate, endDate);

  if (!priceData[tradingTicker] || Object.keys(priceData[tradingTicker]).length === 0) {
    return { success: false, error: `未找到 ${tradingTicker} 的价格数据` };
  }

  // 提取排序后的日期与价格
  const datePriceMap = priceData[tradingTicker];
  const dates = Object.keys(datePriceMap)
    .sort()
    .filter((d) => d >= startDate && d <= endDate);
  const prices = dates.map((d) => datePriceMap[d]);

  if (dates.length < 10) {
    return { success: false, error: '有效交易日不足，无法运行网格搜索' };
  }

  // 3. 调用引擎模块
  const response = runGridSearch(request, priceData, dates, prices, tradingTicker);

  logger.info(
    `[tactical-grid] 网格搜索完成: ${totalCombinations}个组合, 耗时${Date.now() - startTime}ms`,
  );

  return { success: true, data: response as unknown as Record<string, unknown> };
}

/**
 * POST /api/tactical-grid/search
 * 接收参数网格定义，遍历所有参数组合运行回测，返回排序结果
 *
 * Architecture: 异步任务提交，立即返回202
 * 企业为何需要：网格搜索200组合同步执行阻塞事件循环
 * 权衡：客户端需轮询获取结果，但系统整体吞吐量大幅提升
 */
router.post('/search', validate(tacticalGridSearchSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    // 先做参数组合上限校验，避免提交明显非法的任务到队列
    const body = req.body as TacticalGridRequest;
    const p1Count =
      body.param1?.step > 0
        ? Math.floor((body.param1.max - body.param1.min) / body.param1.step) + 1
        : 1;
    const p2Count =
      body.param2?.step > 0
        ? Math.floor((body.param2.max - body.param2.min) / body.param2.step) + 1
        : 1;
    if (p1Count * p2Count > MAX_GRID_COMBINATIONS) {
      res.status(400).json({
        success: false,
        error: `参数组合过多(${p1Count * p2Count})，请缩小参数范围（上限${MAX_GRID_COMBINATIONS}）`,
      });
      return;
    }

    try {
      const job = await backtestQueue.add('grid-search', {
        type: 'grid-search',
        payload: req.body,
      } as BacktestJobData);

      res.status(202).json({
        type: 'https://httpstatuses.com/202',
        title: 'Accepted',
        status: 202,
        detail: 'Grid search task submitted',
        jobId: job.id,
        statusUrl: `/api/v1/jobs/${job.id}`,
      });
      return;
    } catch (queueError) {
      // Redis不可用时回退到同步执行
      logger.warn({ error: (queueError as Error).message }, '[tactical-grid] BullMQ不可用，回退到同步执行');
    }

    // 同步回退：Redis不可用时直接执行
    const result = await executeGridSearch(req.body as Record<string, unknown>);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ err: error as Error }, '[tactical-grid] 网格搜索失败');
    res.status(500).json({ success: false, error: '战术网格搜索运行失败' });
  }
});

export default router;
