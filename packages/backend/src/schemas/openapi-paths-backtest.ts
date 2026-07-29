/**
 * OpenAPI 路径注册 —— backtest / backtest-optimizer / tactical / tactical-grid /
 * signal / pca / letf / goal-optimizer / calculators / factor-regression
 * （D6-002 拆分自 openapi-registry.ts）。
 *
 * 涵盖所有计算密集型端点：组合回测、蒙特卡洛、组合优化、有效前沿、
 * 战术分配、信号分析、PCA、杠杆 ETF、目标优化、计算器与因子回归。
 */
import { z } from 'zod';
import { reg, idParam, AcceptedEnvelope } from './openapi-components.js';
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
  tacticalAlertSchema,
} from './tactical.js';
import { tacticalGridSearchSchema } from './tacticalGrid.js';
import { pcaAnalyzeSchema, letfAnalyzeSchema, goalOptimizerSchema } from './analysisSchemas.js';

/** 注册 backtest 路径（搜索/组合/分析/蒙特卡洛/优化/有效前沿/异步任务）。 */
function registerBacktestEndpoints(): void {
  reg({
    method: 'get',
    path: '/backtest/search',
    tag: 'backtest',
    summary: '搜索可回测标的',
    security: true,
    query: searchQuerySchema,
    errors: [400, 401, 422],
  });
  reg({
    method: 'post',
    path: '/backtest/portfolio',
    tag: 'backtest',
    summary: '组合回测',
    security: true,
    body: portfolioBacktestSchema,
    accepted: AcceptedEnvelope,
    acceptedDescription: '任务已入队，通过 GET /backtest/runs/:jobId 轮询结果',
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/backtest/portfolio/series',
    tag: 'backtest',
    summary: '从缓存补全 Tab 序列',
    security: true,
    body: portfolioSeriesSchema,
    errors: [400, 401, 422],
  });
  reg({
    method: 'post',
    path: '/backtest/analysis',
    tag: 'backtest',
    summary: '资产分析',
    security: true,
    body: analysisSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/backtest/monte-carlo',
    tag: 'backtest',
    summary: '蒙特卡洛模拟',
    security: true,
    body: monteCarloSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/backtest/optimize',
    tag: 'backtest',
    summary: '组合优化',
    security: true,
    body: optimizeSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/backtest/efficient-frontier',
    tag: 'backtest',
    summary: '有效前沿',
    security: true,
    body: efficientFrontierSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'get',
    path: '/backtest/runs/{jobId}',
    tag: 'backtest',
    summary: '查询异步回测任务状态',
    security: true,
    params: idParam('jobId'),
    errors: [400, 401, 404, 503],
  });
}

/** 注册 backtest-optimizer / tactical / tactical-grid 路径。 */
function registerTacticalPaths(): void {
  reg({
    method: 'post',
    path: '/backtest-optimizer/optimize',
    tag: 'backtest-optimizer',
    summary: '参数空间网格优化',
    security: true,
    body: backtestOptimizerSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/tactical/backtest',
    tag: 'tactical',
    summary: '战术分配回测',
    security: true,
    body: tacticalBacktestSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/tactical/what-if',
    tag: 'tactical',
    summary: '战术 What-If 分析',
    security: true,
    body: tacticalWhatIfSchema,
    errors: [400, 401, 422, 503],
  });
  reg({
    method: 'post',
    path: '/tactical/alerts',
    tag: 'tactical',
    summary: '配置战术告警',
    security: true,
    body: tacticalAlertSchema,
    errors: [400, 401, 422],
  });
  reg({
    method: 'post',
    path: '/tactical-grid/search',
    tag: 'tactical-grid',
    summary: '战术网格参数搜索',
    security: true,
    body: tacticalGridSearchSchema,
    errors: [400, 401, 422, 500, 503],
  });
}

/** 注册 signal 路径（单信号/双信号/多信号分析）。 */
function registerSignalPaths(): void {
  reg({
    method: 'post',
    path: '/signal/analyze',
    tag: 'signal',
    summary: '单信号分析',
    security: true,
    body: signalAnalyzeSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/signal/dual',
    tag: 'signal',
    summary: '双信号组合分析',
    security: true,
    body: signalDualSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/signal/multi',
    tag: 'signal',
    summary: '多信号聚合分析',
    security: true,
    body: signalMultiSchema,
    errors: [400, 401, 422, 500, 503],
  });
}

/** 注册 analysis 路径（pca/letf/goal-optimizer/calculators/factor-regression，ADR-042）。 */
function registerAnalysisPaths(): void {
  reg({
    method: 'post',
    path: '/pca/analyze',
    tag: 'pca',
    summary: 'PCA 主成分分析',
    security: true,
    body: pcaAnalyzeSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/letf/analyze',
    tag: 'letf',
    summary: '杠杆 ETF 滑点分析',
    security: true,
    body: letfAnalyzeSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/goal-optimizer/optimize',
    tag: 'goal-optimizer',
    summary: '目标优化（蒙特卡洛达成概率）',
    security: true,
    body: goalOptimizerSchema,
    errors: [400, 401, 422, 500, 503],
  });
  reg({
    method: 'post',
    path: '/calculators/{type}',
    tag: 'calculators',
    summary: '计算器（按类型）',
    security: true,
    params: z.object({ type: z.string() }),
    errors: [400, 401, 422, 503],
  });
  reg({
    method: 'post',
    path: '/analysis/factor-regression',
    tag: 'factor-regression',
    summary: '因子回归分析',
    security: true,
    errors: [400, 401, 422, 503],
  });
}

/**
 * 注册 backtest / backtest-optimizer / tactical / tactical-grid / signal /
 * pca / letf / goal-optimizer / calculators / factor-regression 路径。
 */
export function registerBacktestPaths(): void {
  registerBacktestEndpoints();
  registerTacticalPaths();
  registerSignalPaths();
  registerAnalysisPaths();
}