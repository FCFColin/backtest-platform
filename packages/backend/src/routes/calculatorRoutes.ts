/**
 * Calculators 路由 — POST /api/v1/calculators/:type
 *
 * 纯转发型 application service 已合并到路由层（ADR: 消除空心化代理层）。
 * 计算逻辑在 Go 引擎 /api/engine/calculators（ADR-031）。
 */
import { Router, type Request, type Response } from 'express';
import { sendProblem } from '../utils/errors.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { logger } from '../utils/logger.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

const VALID_CALC_TYPES = ['cagr', 'swr', 'frontier'];

router.post(
  '/:type',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { type } = req.params;
      const body = req.body;

      if (!VALID_CALC_TYPES.includes(type)) {
        sendProblem(res, 422, 'CALC_INVALID_TYPE', 'Invalid calculator type', {
          detail: `type 必须是: ${VALID_CALC_TYPES.join(', ')}`,
        });
        return;
      }

      logger.info(`[Calculator] 执行 ${type} 计算`);
      const result = await callEngineStrict('/api/engine/calculators', { type, ...body });
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[Calculators] 失败',
      code: 'CALC_ERROR',
      title: 'Calculator failed',
      detail: '计算器执行失败',
      endpoint: 'calculator',
    },
  ),
);

export default router;
