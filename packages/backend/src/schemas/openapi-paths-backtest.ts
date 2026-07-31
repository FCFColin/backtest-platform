/**
 * OpenAPI 路径注册 — backtest/计算域（BIG2 拆分）
 *
 * 覆盖组合回测/分析/蒙特卡洛/优化/有效前沿/网格优化/战术/信号/PCA/LETF/目标优化/计算器。
 */
import { z } from 'zod';
import { sec, idParam, BACKTEST_ERR, TACTICAL_ERR } from './openapi-paths-shared.js';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
  portfolioSeriesSchema,
} from './backtest.js';
import { searchQuerySchema } from './data.js';
import { backtestOptimizerSchema } from './optimizer.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from './signal.js';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalGridSearchSchema,
} from './tactical.js';
import { pcaAnalyzeSchema, letfAnalyzeSchema, goalOptimizerSchema } from './analysisSchemas.js';
import { AcceptedEnvelope } from './openapi-components.js';

function registerBacktestEndpoints(): void {
  sec('get', '/backtest/search', 'backtest', '搜索可回测标的', [400, 401, 422], {
    query: searchQuerySchema,
  });
  sec('post', '/backtest/portfolio', 'backtest', '组合回测', BACKTEST_ERR, {
    body: portfolioBacktestSchema,
    accepted: AcceptedEnvelope,
    acceptedDescription: '任务已入队，通过 GET /backtest/runs/:jobId 轮询结果',
  });
  sec('post', '/backtest/portfolio/series', 'backtest', '从缓存补全 Tab 序列', [400, 401, 422], {
    body: portfolioSeriesSchema,
  });
  sec('post', '/backtest/analysis', 'backtest', '资产分析', BACKTEST_ERR, { body: analysisSchema });
  sec('post', '/backtest/monte-carlo', 'backtest', '蒙特卡洛模拟', BACKTEST_ERR, {
    body: monteCarloSchema,
  });
  sec('post', '/backtest/optimize', 'backtest', '组合优化', BACKTEST_ERR, { body: optimizeSchema });
  sec('post', '/backtest/efficient-frontier', 'backtest', '有效前沿', BACKTEST_ERR, {
    body: efficientFrontierSchema,
  });
  sec('get', '/backtest/runs/{jobId}', 'backtest', '查询异步回测任务状态', [400, 401, 404, 503], {
    params: idParam('jobId'),
  });
}

function registerTacticalPaths(): void {
  sec(
    'post',
    '/backtest-optimizer/optimize',
    'backtest-optimizer',
    '参数空间网格优化',
    BACKTEST_ERR,
    {
      body: backtestOptimizerSchema,
    },
  );
  sec('post', '/tactical/backtest', 'tactical', '战术分配回测', BACKTEST_ERR, {
    body: tacticalBacktestSchema,
  });
  sec('post', '/tactical/what-if', 'tactical', '战术 What-If 分析', TACTICAL_ERR, {
    body: tacticalWhatIfSchema,
  });
  sec('post', '/tactical-grid/search', 'tactical-grid', '战术网格参数搜索', BACKTEST_ERR, {
    body: tacticalGridSearchSchema,
  });
}

function registerSignalPaths(): void {
  sec('post', '/signal/analyze', 'signal', '单信号分析', BACKTEST_ERR, {
    body: signalAnalyzeSchema,
  });
  sec('post', '/signal/dual', 'signal', '双信号组合分析', BACKTEST_ERR, { body: signalDualSchema });
  sec('post', '/signal/multi', 'signal', '多信号聚合分析', BACKTEST_ERR, {
    body: signalMultiSchema,
  });
}

function registerAnalysisPaths(): void {
  sec('post', '/pca/analyze', 'pca', 'PCA 主成分分析', BACKTEST_ERR, { body: pcaAnalyzeSchema });
  sec('post', '/letf/analyze', 'letf', '杠杆 ETF 滑点分析', BACKTEST_ERR, {
    body: letfAnalyzeSchema,
  });
  sec(
    'post',
    '/goal-optimizer/optimize',
    'goal-optimizer',
    '目标优化（蒙特卡洛达成概率）',
    BACKTEST_ERR,
    { body: goalOptimizerSchema },
  );
  sec('post', '/calculators/{type}', 'calculators', '计算器（按类型）', TACTICAL_ERR, {
    params: z.object({ type: z.string() }),
  });
  sec('post', '/analysis/factor-regression', 'factor-regression', '因子回归分析', TACTICAL_ERR);
}

export function registerBacktestPaths(): void {
  registerBacktestEndpoints();
  registerTacticalPaths();
  registerSignalPaths();
  registerAnalysisPaths();
}
