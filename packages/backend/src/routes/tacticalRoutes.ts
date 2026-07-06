/**
 * 战术分配（Tactical Allocation）路由
 *
 * POST /api/tactical/backtest  - 接收战术策略配置，计算信号并运行回测
 * POST /api/tactical/what-if   - 接收 ticker 列表，返回实时价格与当前信号状态
 * POST /api/tactical/alerts    - 保存邮件告警配置（内存暂存）
 */

import { Router, type Request, type Response } from 'express';
import type { TacticalStrategy, EmailAlertConfig } from '@backtest/shared/types/tactical';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { requireApiKey } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalAlertSchema,
} from '../schemas/tactical.js';
import { collectTickers } from '../application/tactical-application-service.js';
import {
  executeTacticalBacktest,
  executeTacticalWhatIf,
  saveTacticalAlertConfig,
} from '../application/tactical-application-service.js';

const router = Router();

interface BacktestRequest {
  strategy: TacticalStrategy;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: import('@backtest/shared/types/index').RebalanceFrequency;
}

interface WhatIfRequest {
  tickers: string[];
  strategy: TacticalStrategy;
  endDate?: string;
}

interface AlertRequest {
  config: EmailAlertConfig;
}

router.post(
  '/backtest',
  validate(tacticalBacktestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const body = req.body as BacktestRequest;
      const { strategy, startDate, endDate } = body;

      if (!strategy?.signals?.length) {
        sendProblem(res, 422, 'MISSING_SIGNALS', 'Missing strategy signals', {
          detail: '缺少策略信号配置',
        });
        return;
      }
      if (!startDate || !endDate) {
        sendProblem(res, 422, 'MISSING_DATES', 'Missing date range', { detail: '缺少起止日期' });
        return;
      }

      const allTickers = collectTickers(strategy);
      if (allTickers.length === 0) {
        sendProblem(res, 422, 'NO_TICKERS', 'No tickers in strategy', {
          detail: '策略未配置任何目标标的',
        });
        return;
      }

      const priceData = await fetchHistoryData(allTickers, startDate, endDate);
      const data = executeTacticalBacktest(body, priceData);

      res.json({ success: true, data });
      logger.info(`[tactical] 回测完成，耗时 ${Date.now() - startTime}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('无效') || message.includes('交易日不足')) {
        sendProblem(res, 422, 'TACTICAL_VALIDATION', 'Tactical backtest validation failed', {
          detail: message,
        });
        return;
      }
      logger.error({ err: error as Error }, '[tactical] 回测失败');
      sendProblem(res, 500, 'TACTICAL_BACKTEST_ERROR', 'Tactical backtest failed', {
        detail: '战术回测运行失败',
      });
    }
  },
);

router.post(
  '/what-if',
  validate(tacticalWhatIfSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tickers, strategy, endDate } = req.body as WhatIfRequest;

      if (!tickers?.length) {
        sendProblem(res, 422, 'MISSING_TICKERS', 'Missing tickers', {
          detail: '请至少输入一个标的代码',
        });
        return;
      }

      const end = endDate || new Date().toISOString().substring(0, 10);
      const start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      const startDate = start.toISOString().substring(0, 10);

      const priceData = await fetchHistoryData(tickers, startDate, end);
      const results = executeTacticalWhatIf(tickers, strategy, priceData, end);

      res.json({ success: true, data: results });
    } catch (error) {
      logger.error({ err: error as Error }, '[tactical] what-if 查询失败');
      sendProblem(res, 500, 'TACTICAL_WHATIF_ERROR', 'What-if query failed', {
        detail: '实时价格查询失败',
      });
    }
  },
);

router.post(
  '/alerts',
  requireApiKey,
  validate(tacticalAlertSchema),
  (req: Request, res: Response): void => {
    try {
      const { config } = req.body as AlertRequest;
      if (!config) {
        sendProblem(res, 422, 'MISSING_CONFIG', 'Missing alert config', { detail: '缺少告警配置' });
        return;
      }
      const saved = saveTacticalAlertConfig(config);
      logger.info(`[tactical] 告警配置已保存，启用状态: ${saved.enabled}`);
      res.json({ success: true, data: { saved: true, config: saved } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('邮箱')) {
        sendProblem(res, 422, 'MISSING_EMAIL', 'Email required when alerts enabled', {
          detail: message,
        });
        return;
      }
      logger.error({ err: error as Error }, '[tactical] 保存告警配置失败');
      sendProblem(res, 500, 'TACTICAL_ALERT_ERROR', 'Failed to save alert config', {
        detail: '保存告警配置失败',
      });
    }
  },
);

export default router;
