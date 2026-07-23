/**
 * 分析编排器（Orchestrator）— 纯 fetch data + call engine，无 domain 交互。
 *
 * 合并了原 analysis-service.ts（单资产分析）与 analytics-application-service.ts（PCA/LETF/GoalOptimizer）。
 * 所有计算逻辑已迁移到 Go 引擎（ADR-031），此编排器仅负责参数校验、数据获取编排与引擎调用。
 *
 * 命名约定（见 application/README.md）：纯透传到引擎、不涉及 domain 聚合根的编排器
 * 命名 *Orchestrator 并放在 application/，与涉及 domain 的 application service 区分。
 */
import type {
  PCARequest,
  GoalOptimizerRequest,
  PCAResult,
  BacktestParameters,
} from '@backtest/shared/types/index';
import type { LETFRequest } from '@backtest/shared/types/letf';
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { logger } from '../utils/logger.js';
import { buildEngineParams } from './backtest/engineBodyBuilder.js';
import { ValidationError } from '../utils/errors.js';
import { toDateStr, todayStr } from '../utils/dateUtils.js';
import {
  ensurePriceDataExists,
  ensureTickerHasData,
  normalizeTickers,
} from './backtest/priceDataUtils.js';
import { fetchPriceData, calculateDateRange } from './backtest-helpers.js';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';

// ---------------------------------------------------------------------------
// 单资产分析
// ---------------------------------------------------------------------------

/** 组装分析结果：提取引擎返回的 assets/correlations，附加 warnings 和 dateRange。 */
function assembleAnalysisResult(
  result: Record<string, unknown>,
  warnings: Warning[],
  dateRange: DateRangeInfo,
): Record<string, unknown> & { warnings?: Warning[]; dateRange: DateRangeInfo } {
  const engineResp = result as { data?: { assets?: unknown[]; correlations?: unknown[][] } };
  const engineData = engineResp?.data;
  const finalResult: Record<string, unknown> = {};
  if (engineData && engineData.assets) {
    finalResult.tickers = engineData.assets;
    finalResult.correlations = engineData.correlations || [];
  } else {
    Object.assign(finalResult, result);
  }
  if (warnings.length > 0) {
    finalResult.warnings = warnings;
  }
  finalResult.dateRange = dateRange;
  return finalResult as Record<string, unknown> & {
    warnings?: Warning[];
    dateRange: DateRangeInfo;
  };
}

/**
 * 运行单资产分析。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runAnalysis(
  tickers: string[],
  parameters: BacktestParameters,
): Promise<Record<string, unknown> & { warnings?: Warning[]; dateRange?: DateRangeInfo }> {
  const {
    data: priceData,
    degraded,
    degradedWarning,
  } = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);
  const warnings: Warning[] = [];

  if (degraded) {
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
  }

  const validTickers = tickers.filter((t) => priceData[t] && Object.keys(priceData[t]).length > 0);
  if (validTickers.length === 0) {
    throw new ValidationError(`Price data unavailable for all tickers: ${tickers.join(', ')}`);
  }
  if (validTickers.length < tickers.length) {
    const missing = tickers.filter((t) => !validTickers.includes(t));
    logger.warn(`[analysis] 部分标的价格数据缺失，已忽略: ${missing.join(', ')}`);
    warnings.push({ code: 'TICKER_NOT_FOUND', tickers: missing });
  }

  const result = await callEngineStrict<Record<string, unknown>>('/api/engine/analysis', {
    tickers: validTickers,
    priceData,
    params: buildEngineParams(parameters),
  });

  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    validTickers.length < tickers.length
      ? tickers.filter((t) => !validTickers.includes(t))
      : undefined,
  );

  return assembleAnalysisResult(result, warnings, dateRange);
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

/** 运行分析（含数据获取）的共享模式。 */
async function runAnalysisWithFetch<T>(
  tickers: string[],
  startDate: string,
  endDate: string,
  run: (priceData: Record<string, Record<string, number>>) => Promise<T>,
): Promise<T> {
  const { data: priceData } = await fetchHistoryData(tickers, startDate, endDate);
  return run(priceData);
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
  const clean = normalizeTickers(req.tickers);
  if (clean.length < 2) {
    throw new ValidationError('PCA analysis requires at least 2 assets');
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
  return runAnalysisWithFetch(cleanTickers, body.startDate, body.endDate, (priceData) =>
    executePcaAnalyze(cleanTickers, priceData, body.numComponents),
  );
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
  return runAnalysisWithFetch(
    [String(req.letfTicker).trim().toUpperCase(), String(req.benchmarkTicker).trim().toUpperCase()],
    req.startDate,
    req.endDate,
    (priceData) => executeLetfAnalyze(req, priceData),
  );
}

// ---------------------------------------------------------------------------
// 目标优化
// ---------------------------------------------------------------------------

/** 校验目标优化请求资产列表。 */
export function validateGoalOptimizerAssets(request: GoalOptimizerRequest): string[] {
  const validAssets = request.assets.filter((a) => a.ticker && a.ticker.trim());
  if (validAssets.length === 0) {
    throw new ValidationError('Please add at least one valid ticker');
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
  return runAnalysisWithFetch(Array.from(new Set(tickers)), startDateStr, endDateStr, (priceData) =>
    executeGoalOptimize(request, priceData, startDateStr, endDateStr),
  );
}
