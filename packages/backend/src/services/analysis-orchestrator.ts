/**
 * 分析编排器（Orchestrator）— 纯 fetch data + call engine，无 domain 交互。
 *
 * 合并了原 analysis-service.ts（单资产分析）与 analytics-application-service.ts（PCA/LETF/GoalOptimizer）。
 * 所有计算逻辑已迁移到 Go 引擎（ADR-031），此编排器仅负责参数校验、数据获取编排与引擎调用。
 *
 * 命名约定（见 application/README.md）：纯透传到引擎、不涉及 domain 聚合根的编排器
 * 命名 *Orchestrator 并放在 services/，与涉及 domain 的 application service 区分。
 */
import type {
  PCARequest,
  GoalOptimizerRequest,
  PCAResult,
  BacktestParameters,
} from '@backtest/shared/types/index';
import type { LETFRequest } from '@backtest/shared/types/letf';
import { fetchHistoryData } from './dataService.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from '../application/backtest/engineBodyBuilder.js';
import { ValidationError } from '../utils/errors.js';
import { toDateStr, todayStr } from '../utils/dateUtils.js';
import {
  ensurePriceDataExists,
  ensureTickerHasData,
  normalizeTickers,
} from '../application/backtest/priceDataUtils.js';
import { fetchPriceData } from '../application/backtest-helpers.js';

// ---------------------------------------------------------------------------
// 单资产分析
// ---------------------------------------------------------------------------

/**
 * 运行单资产分析。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runAnalysis(
  tickers: string[],
  parameters: BacktestParameters,
): Promise<Record<string, unknown>> {
  const priceData = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);

  const result = await callEngineStrict<Record<string, unknown>>('/api/engine/analysis', {
    tickers,
    priceData,
    params: buildEngineParams(parameters),
  });

  const engineResp = result as { data?: { assets?: unknown[]; correlations?: unknown[][] } };
  const engineData = engineResp?.data;
  if (engineData && engineData.assets) {
    return {
      tickers: engineData.assets,
      correlations: engineData.correlations || [],
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// PCA 主成分分析
// ---------------------------------------------------------------------------

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
  ensurePriceDataExists(tickers, priceData, 'PCA');
  return callEngineStrict<PCAResult>('/api/engine/pca', { tickers, priceData, numComponents });
}

/** 规范化 PCA 请求 ticker 列表。 */
export function normalizePcaTickers(tickers: string[]): string[] {
  return normalizeTickers(tickers);
}

/**
 * 校验 PCA 请求。
 *
 * @throws Error 校验失败
 */
export function validatePcaRequest(req: PCARequest): string[] {
  if (!Array.isArray(req.tickers) || req.tickers.length === 0) {
    throw new ValidationError('Missing or invalid field: tickers (must be a non-empty array)');
  }
  if (!req.startDate || !req.endDate) {
    throw new ValidationError('Missing required fields: startDate, endDate');
  }
  const clean = normalizePcaTickers(req.tickers);
  if (clean.length < 2) {
    throw new ValidationError('PCA 分析至少需要 2 个资产');
  }
  return clean;
}

/**
 * 执行 PCA 分析（含数据获取）。
 *
 * @throws Error 参数或数据无效
 */
export async function executePcaAnalyzeWithFetch(body: PCARequest) {
  const cleanTickers = validatePcaRequest(body);
  const { data: priceData } = await fetchHistoryData(cleanTickers, body.startDate, body.endDate);
  return executePcaAnalyze(cleanTickers, priceData, body.numComponents);
}

// ---------------------------------------------------------------------------
// LETF 滑点分析
// ---------------------------------------------------------------------------

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

  ensureTickerHasData(cleanLetf, priceData, '杠杆 ETF');
  ensureTickerHasData(cleanBench, priceData, '基准指数');

  return callEngineStrict('/api/engine/letf-analyze', {
    letfTicker: cleanLetf,
    benchmarkTicker: cleanBench,
    leverage: lev,
    priceData,
  });
}

/**
 * 执行 LETF 滑点分析（含数据获取）。
 *
 * @throws Error 数据缺失
 */
export async function executeLetfAnalyzeWithFetch(req: LETFRequest) {
  const cleanLetf = String(req.letfTicker).trim().toUpperCase();
  const cleanBench = String(req.benchmarkTicker).trim().toUpperCase();
  const { data: priceData } = await fetchHistoryData(
    [cleanLetf, cleanBench],
    req.startDate,
    req.endDate,
  );
  return executeLetfAnalyze(req, priceData);
}

// ---------------------------------------------------------------------------
// 目标优化
// ---------------------------------------------------------------------------

/** 校验目标优化请求资产列表。 */
export function validateGoalOptimizerAssets(request: GoalOptimizerRequest): string[] {
  const validAssets = request.assets.filter((a) => a.ticker && a.ticker.trim());
  if (validAssets.length === 0) {
    throw new ValidationError('请至少添加一个有效标的');
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
  ensurePriceDataExists(tickers, priceData, 'GoalOptimizer');

  return callEngineStrict('/api/engine/goal-optimize', {
    ...request,
    priceData,
    startDate,
    endDate,
  });
}

/**
 * 执行目标优化（含数据获取）。
 *
 * @throws Error 数据不足
 */
export async function executeGoalOptimizeWithFetch(request: GoalOptimizerRequest) {
  const tickers = validateGoalOptimizerAssets(request);
  const endDateStr = todayStr();
  const startDateStr = toDateStr(new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000));
  const { data: priceData } = await fetchHistoryData(
    Array.from(new Set(tickers)),
    startDateStr,
    endDateStr,
  );
  return executeGoalOptimize(request, priceData, startDateStr, endDateStr);
}
