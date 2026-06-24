/**
 * 目标优化（Goal Optimizer）路由
 * POST /api/goal-optimizer/optimize - 运行蒙特卡洛模拟，计算达成财务目标的概率与建议配置
 *
 * 路由层仅负责：参数校验、调用引擎、响应包装
 * 核心算法见 api/engine/goalOptimizer.ts
 */

import { Router, type Request, type Response } from 'express';
import type { GoalOptimizerRequest } from '../../shared/types.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { goalOptimizerSchema } from '../schemas/goalOptimizer.js';
import { optimizeGoals } from '../engine/goalOptimizer.js';

const router = Router();

/**
 * POST /api/goal-optimizer/optimize
 * Body: GoalOptimizerRequest
 */
router.post('/optimize', validate(goalOptimizerSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const request = req.body as GoalOptimizerRequest;

    // 参数校验
    if (!request || typeof request.targetAmount !== 'number' || request.targetAmount <= 0) {
      res.status(400).json({ success: false, error: 'targetAmount 必须为正数' });
      return;
    }
    if (typeof request.initialAmount !== 'number' || request.initialAmount <= 0) {
      res.status(400).json({ success: false, error: 'initialAmount 必须为正数' });
      return;
    }
    if (typeof request.years !== 'number' || request.years <= 0) {
      res.status(400).json({ success: false, error: 'years 必须为正数' });
      return;
    }
    if (!Array.isArray(request.assets) || request.assets.length === 0) {
      res.status(400).json({ success: false, error: 'assets 不能为空' });
      return;
    }

    const validAssets = request.assets.filter((a) => a.ticker && a.ticker.trim());
    if (validAssets.length === 0) {
      res.status(400).json({ success: false, error: '请至少添加一个有效标的' });
      return;
    }

    const numSimulations = typeof request.numSimulations === 'number' && isFinite(request.numSimulations)
      ? request.numSimulations
      : 1000;
    const sanitize = (s: string) => s.replace(/[\n\r]/g, '').substring(0, 50);
    logger.info(
      `[GoalOptimizer] 开始优化: target=${request.targetAmount}, initial=${request.initialAmount}, years=${request.years}, sims=${numSimulations}, assets=${validAssets.map((a) => sanitize(a.ticker)).join(',')}`,
    );

    // 获取历史价格数据（默认取近 10 年）
    const endDateStr = new Date().toISOString().split('T')[0];
    const startDateStr = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const tickers = Array.from(
      new Set(validAssets.map((a) => a.ticker.trim().toUpperCase())),
    );
    const priceData = await fetchHistoryData(tickers, startDateStr, endDateStr);

    // 检查数据有效性
    const missingTickers = tickers.filter(
      (t) => !priceData[t] || Object.keys(priceData[t]).length === 0,
    );
    if (missingTickers.length > 0) {
      res.status(400).json({
        success: false,
        error: `以下资产未找到价格数据: ${missingTickers.join(', ')}`,
      });
      return;
    }

    // 调用引擎模块
    const result = optimizeGoals(request, priceData, startDateStr, endDateStr);

    // 检查是否有足够数据
    if (result.successProbability === 0 && result.probabilityCurve.length === 0) {
      res.status(400).json({
        success: false,
        error: '历史价格数据不足，无法计算收益率统计',
      });
      return;
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      `[GoalOptimizer] 优化完成: successProb=${(result.successProbability * 100).toFixed(1)}%, 耗时 ${elapsed}ms`,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[GoalOptimizer] 优化失败');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '目标优化失败',
    });
  }
});

export default router;
