/**
 * Factor Regression 路由 — POST /api/v1/analysis/factor-regression
 *
 * 纯转发型 application service 已合并到路由层。
 * 计算逻辑在 Go 引擎 /api/engine/factor-regression（ADR-031）。
 */
import { Router, type Request, type Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { logger } from '../utils/logger.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/factor-regression',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { monthlyReturns, ffData, factors, startDate, endDate } = req.body;

      if (!monthlyReturns || !Array.isArray(monthlyReturns) || monthlyReturns.length === 0) {
        throw new ValidationError('monthlyReturns 不能为空');
      }
      if (!ffData || !Array.isArray(ffData) || ffData.length === 0) {
        throw new ValidationError('ffData 不能为空');
      }

      logger.info('[FactorRegression] 开始回归');
      const result = await callEngineStrict('/api/engine/factor-regression', {
        monthlyReturns,
        ffData,
        factors: factors || ['mktRF', 'smb', 'hml'],
        startDate: startDate || '',
        endDate: endDate || '',
      });
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[FactorRegression] 失败',
      code: 'FR_ERROR',
      title: 'Factor regression failed',
      detail: '因子回归失败',
      endpoint: 'factor-regression',
    },
  ),
);

export default router;
