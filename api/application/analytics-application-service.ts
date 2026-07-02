/**
 * 分析类应用服务（T-30）：PCA、LETF、目标优化
 */
import type { PCARequest, GoalOptimizerRequest } from '../../shared/types/index.js';
import type { LETFRequest } from '../../shared/types/letf.js';
import { performPCA } from '../engine/pca.js';
import { toSortedSeries } from '../engine/seriesUtils.js';
import { analyzeLetfSlippage } from '../engine/letf.js';
import { optimizeGoals } from '../engine/goalOptimizer.js';

/**
 * 执行 PCA 分析。
 *
 * @throws Error 参数或数据无效
 */
export function executePcaAnalyze(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  numComponents?: number,
) {
  const missingTickers = tickers.filter(
    (t) => !priceData[t] || Object.keys(priceData[t]).length === 0,
  );
  if (missingTickers.length > 0) {
    throw new Error(`以下资产未找到价格数据: ${missingTickers.join(', ')}`);
  }
  return performPCA(tickers, priceData, numComponents);
}

/**
 * 规范化 PCA 请求 ticker 列表。
 */
export function normalizePcaTickers(tickers: string[]): string[] {
  return Array.from(new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean)));
}

/**
 * 校验 PCA 请求。
 *
 * @throws Error 校验失败
 */
export function validatePcaRequest(req: PCARequest): string[] {
  if (!Array.isArray(req.tickers) || req.tickers.length === 0) {
    throw new Error('Missing or invalid field: tickers (must be a non-empty array)');
  }
  if (!req.startDate || !req.endDate) {
    throw new Error('Missing required fields: startDate, endDate');
  }
  const clean = normalizePcaTickers(req.tickers);
  if (clean.length < 2) {
    throw new Error('PCA 分析至少需要 2 个资产');
  }
  return clean;
}

/**
 * 执行 LETF 滑点分析。
 *
 * @throws Error 数据缺失
 */
export function executeLetfAnalyze(
  req: LETFRequest,
  priceData: Record<string, Record<string, number>>,
) {
  const cleanLetf = String(req.letfTicker).trim().toUpperCase();
  const cleanBench = String(req.benchmarkTicker).trim().toUpperCase();
  const lev = Number(req.leverage);

  if (!priceData[cleanLetf] || Object.keys(priceData[cleanLetf]).length === 0) {
    throw new Error(`未找到杠杆 ETF ${cleanLetf} 的价格数据`);
  }
  if (!priceData[cleanBench] || Object.keys(priceData[cleanBench]).length === 0) {
    throw new Error(`未找到基准指数 ${cleanBench} 的价格数据`);
  }

  const letfSeries = toSortedSeries(priceData[cleanLetf]);
  const benchSeries = toSortedSeries(priceData[cleanBench]);
  return analyzeLetfSlippage(letfSeries, benchSeries, lev);
}

/**
 * 校验目标优化请求资产列表。
 */
export function validateGoalOptimizerAssets(request: GoalOptimizerRequest): string[] {
  const validAssets = request.assets.filter((a) => a.ticker && a.ticker.trim());
  if (validAssets.length === 0) {
    throw new Error('请至少添加一个有效标的');
  }
  return Array.from(new Set(validAssets.map((a) => a.ticker.trim().toUpperCase())));
}

/**
 * 执行目标优化。
 *
 * @throws Error 数据不足
 */
export function executeGoalOptimize(
  request: GoalOptimizerRequest,
  priceData: Record<string, Record<string, number>>,
  startDate: string,
  endDate: string,
) {
  const tickers = validateGoalOptimizerAssets(request);
  const missingTickers = tickers.filter(
    (t) => !priceData[t] || Object.keys(priceData[t]).length === 0,
  );
  if (missingTickers.length > 0) {
    throw new Error(`以下资产未找到价格数据: ${missingTickers.join(', ')}`);
  }

  const result = optimizeGoals(request, priceData, startDate, endDate);
  if (result.successProbability === 0 && result.probabilityCurve.length === 0) {
    throw new Error('历史价格数据不足，无法计算收益率统计');
  }
  return result;
}
