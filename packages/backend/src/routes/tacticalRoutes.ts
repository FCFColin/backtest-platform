/**
 * 战术分配（Tactical Allocation）路由 — 薄路由模式。
 *
 * 数据获取已在 application 层中。路由只负责请求解析 + 调用服务 + 响应格式化。
 *
 * POST /api/tactical/backtest  - 接收战术策略配置，计算信号并运行回测
 * POST /api/tactical/what-if   - 接收 ticker 列表，返回实时价格与当前信号状态
 * POST /api/tactical/alerts    - 保存邮件告警配置（内存暂存）
 */

import { Router, type Request, type Response } from 'express';
import type { EmailAlertConfig } from '@backtest/shared/types/tactical';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalAlertSchema,
} from '../schemas/tactical.js';
import {
  executeTacticalBacktest,
  executeTacticalWhatIf,
  saveTacticalAlertConfig,
} from '../application/tactical-application-service.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/backtest',
  validate(tacticalBacktestSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const body = req.body;

      const data = await executeTacticalBacktest(body);
      res.json({ success: true, data });
      logger.info(`[tactical] 回测完成，耗时 ${Date.now() - startTime}ms`);
    },
    {
      logMsg: '[tactical] 回测失败',
      code: 'TACTICAL_BACKTEST_ERROR',
      endpoint: 'tactical-backtest',
    },
  ),
);

router.post(
  '/what-if',
  validate(tacticalWhatIfSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { tickers, strategy } = req.body;
      const results = await executeTacticalWhatIf(tickers, strategy);
      res.json({ success: true, data: results });
    },
    {
      logMsg: '[tactical] what-if 查询失败',
      code: 'TACTICAL_WHATIF_ERROR',
      endpoint: 'tactical-whatif',
    },
  ),
);

router.post(
  '/alerts',
  validate(tacticalAlertSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { config } = req.body as { config: EmailAlertConfig };
      const saved = saveTacticalAlertConfig(config);
      logger.info(`[tactical] 告警配置已保存，启用状态: ${saved.enabled}`);
      res.json({ success: true, data: { saved: true, config: saved } });
    },
    {
      logMsg: '[tactical] 保存告警配置失败',
      code: 'TACTICAL_ALERT_ERROR',
      endpoint: 'tactical-alerts',
    },
  ),
);

export default router;
