/**
 * 战术分配（Tactical Allocation）路由
 *
 * POST /api/tactical/backtest  - 接收战术策略配置，计算信号并运行回测
 * POST /api/tactical/what-if   - 接收 ticker 列表，返回实时价格与当前信号状态
 * POST /api/tactical/alerts    - 保存邮件告警配置（内存暂存）
 *
 * 路由层仅负责：参数校验、调用引擎、响应包装
 * 核心算法见 api/engine/tactical.ts
 */

import { Router, type Request, type Response } from 'express';
import type {
  TacticalStrategy,
  EmailAlertConfig,
} from '../../shared/types/tactical.js';
import type { Portfolio, RebalanceFrequency, PortfolioResult } from '../../shared/types/index.js';
import { fetchHistoryData } from '../services/dataService.js';
import { runPortfolioBacktest } from '../engine/portfolio.js';
import { logger } from '../utils/logger.js';
import { requireApiKey } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { tacticalBacktestSchema, tacticalWhatIfSchema, tacticalAlertSchema } from '../schemas/tactical.js';
import {
  collectTickers,
  runTacticalBacktest,
  computeSimpleStatistics,
  analyzeWhatIf,
} from '../engine/tactical.js';

const router = Router();

// ===== 类型定义 =====

interface BacktestRequest {
  strategy: TacticalStrategy;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
}

interface BacktestResponseData {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{ date: string; activeSignals: string[]; weights: Array<{ ticker: string; weight: number }> }>;
}

interface WhatIfRequest {
  tickers: string[];
  strategy: TacticalStrategy;
  endDate?: string;
}

interface AlertRequest {
  config: EmailAlertConfig;
}

// ===== 路由 =====

/**
 * POST /api/tactical/backtest
 * 运行战术分配回测
 */
router.post('/backtest', validate(tacticalBacktestSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { strategy, startDate, endDate, startingValue, rebalanceFrequency } = req.body as BacktestRequest;

    if (!strategy || !strategy.signals || strategy.signals.length === 0) {
      res.status(400).json({ success: false, error: '缺少策略信号配置' });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: '缺少起止日期' });
      return;
    }

    const allTickers = collectTickers(strategy);
    if (allTickers.length === 0) {
      res.status(400).json({ success: false, error: '策略未配置任何目标标的' });
      return;
    }

    const priceData = await fetchHistoryData(allTickers, startDate, endDate);

    const invalidTickers = allTickers.filter((t) => !priceData[t] || Object.keys(priceData[t]).length === 0);
    if (invalidTickers.length > 0) {
      res.json({
        success: false,
        error: `以下标的代码无效：${invalidTickers.join(', ')}`,
      });
      return;
    }

    const dateSet = new Set<string>();
    for (const ticker of allTickers) {
      for (const date of Object.keys(priceData[ticker])) dateSet.add(date);
    }
    const dates = Array.from(dateSet).sort().filter((d) => d >= startDate && d <= endDate);

    if (dates.length < 2) {
      res.json({ success: false, error: '有效交易日不足，无法运行回测' });
      return;
    }

    // 调用引擎模块
    const { result: tacticalResult, signalHistory } = runTacticalBacktest(
      strategy,
      priceData,
      dates,
      startingValue,
      rebalanceFrequency,
    );

    // 等权基准回测（使用 runPortfolioBacktest）
    const benchmarkPortfolio: Portfolio = {
      id: 'tactical-benchmark',
      name: '等权基准',
      assets: allTickers.map((t) => ({ ticker: t, weight: 100 / allTickers.length })),
      rebalanceFrequency,
    };
    const benchmarkParams = {
      startDate,
      endDate,
      startingValue,
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: '',
      cashflowLegs: [],
      oneTimeCashflows: [],
    };
    let benchmarkResult: PortfolioResult;
    try {
      const btResult = runPortfolioBacktest([benchmarkPortfolio], priceData, benchmarkParams);
      benchmarkResult = btResult.portfolios[0];
    } catch (err) {
      logger.warn(`[tactical] 基准回测失败，使用空结果: ${(err as Error).message}`);
      benchmarkResult = {
        name: '等权基准',
        growthCurve: [],
        drawdownCurve: [],
        rollingReturns: [],
        annualReturns: [],
        monthlyReturns: [],
        statistics: computeSimpleStatistics([], startingValue),
      };
    }

    const data: BacktestResponseData = {
      portfolio: tacticalResult,
      benchmark: benchmarkResult,
      signalHistory,
    };

    res.json({ success: true, data });
    logger.info(`[tactical] 回测完成，耗时 ${Date.now() - startTime}ms，${dates.length} 个交易日`);
  } catch (error) {
    logger.error({ err: error as Error }, '[tactical] 回测失败');
    res.status(500).json({ success: false, error: '战术回测运行失败' });
  }
});

/**
 * POST /api/tactical/what-if
 * 实时价格查询与信号状态
 */
router.post('/what-if', validate(tacticalWhatIfSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { tickers, strategy, endDate } = req.body as WhatIfRequest;

    if (!tickers || tickers.length === 0) {
      res.status(400).json({ success: false, error: '请至少输入一个标的代码' });
      return;
    }

    const end = endDate || new Date().toISOString().substring(0, 10);
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
    const startDate = start.toISOString().substring(0, 10);

    const priceData = await fetchHistoryData(tickers, startDate, end);

    // 调用引擎模块
    const results = analyzeWhatIf(tickers, strategy, priceData, end);

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error({ err: error as Error }, '[tactical] what-if 查询失败');
    res.status(500).json({ success: false, error: '实时价格查询失败' });
  }
});

// 告警配置内存暂存（进程级）
let alertConfigStore: EmailAlertConfig | null = null;

/**
 * POST /api/tactical/alerts
 * 保存邮件告警配置（内存暂存）
 */
router.post('/alerts', requireApiKey, validate(tacticalAlertSchema), (req: Request, res: Response): void => {
  try {
    const { config } = req.body as AlertRequest;
    if (!config) {
      res.status(400).json({ success: false, error: '缺少告警配置' });
      return;
    }
    if (config.enabled && !config.email) {
      res.status(400).json({ success: false, error: '启用告警时必须填写邮箱' });
      return;
    }
    alertConfigStore = config;
    logger.info(`[tactical] 告警配置已保存，启用状态: ${config.enabled}, 触发条件: ${config.triggers?.join(',') || '无'}`);
    res.json({ success: true, data: { saved: true, config: alertConfigStore } });
  } catch (error) {
    logger.error({ err: error as Error }, '[tactical] 保存告警配置失败');
    res.status(500).json({ success: false, error: '保存告警配置失败' });
  }
});

export default router;
