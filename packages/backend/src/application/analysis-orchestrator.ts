import type {
  PCARequest,
  GoalOptimizerRequest,
  PCAResult,
  BacktestParameters,
} from '@backtest/shared/types/index';
import type { LETFRequest } from '@backtest/shared/types/letf';
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { callEngineStrict, unwrapEngineData } from '../utils/engineClient.js';
import { logger } from '../utils/logger.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { ValidationError } from '../utils/errors.js';
import { toDateStr, todayStr } from '../utils/misc.js';
import {
  ensurePriceDataExists,
  ensureTickerHasData,
  normalizeTickers,
} from './backtest/backtestEngineUtils.js';
import {
  fetchPriceDataWithRange,
  calculateDateRange,
  pushDegradedWarning,
} from './backtest-helpers.js';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';

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

export async function runAnalysis(
  tickers: string[],
  parameters: BacktestParameters,
): Promise<Record<string, unknown> & { warnings?: Warning[]; dateRange?: DateRangeInfo }> {
  const { priceData, degraded, degradedWarning } = await fetchPriceDataWithRange(
    tickers,
    parameters.startDate,
    parameters.endDate,
  );
  const warnings: Warning[] = [];

  pushDegradedWarning(warnings, degraded, degradedWarning);

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

export function executePcaAnalyze(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  numComponents?: number,
) {
  ensurePriceDataExists(tickers, priceData, 'PCA');
  return callEngineStrict<PCAResult>('/api/engine/pca', {
    tickers,
    priceData,
    numComponents,
  }).then((r) => ((r as { data?: PCAResult })?.data ?? r) as PCAResult);
}

async function runAnalysisWithFetch<T>(
  tickers: string[],
  startDate: string,
  endDate: string,
  run: (priceData: Record<string, Record<string, number>>) => Promise<T>,
): Promise<T> {
  const { data: priceData } = await fetchHistoryData(tickers, startDate, endDate);
  return run(priceData);
}

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

export async function executePcaAnalyzeWithFetch(body: PCARequest) {
  const cleanTickers = validatePcaRequest(body);
  return runAnalysisWithFetch(cleanTickers, body.startDate, body.endDate, (priceData) =>
    executePcaAnalyze(cleanTickers, priceData, body.numComponents),
  );
}

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
  }).then((r) => unwrapEngineData(r));
}

export async function executeLetfAnalyzeWithFetch(req: LETFRequest) {
  return runAnalysisWithFetch(
    [String(req.letfTicker).trim().toUpperCase(), String(req.benchmarkTicker).trim().toUpperCase()],
    req.startDate,
    req.endDate,
    (priceData) => executeLetfAnalyze(req, priceData),
  );
}

export function validateGoalOptimizerAssets(request: GoalOptimizerRequest): string[] {
  const validAssets = request.assets.filter((a) => a.ticker && a.ticker.trim());
  if (validAssets.length === 0) {
    throw new ValidationError('Please add at least one valid ticker');
  }
  return Array.from(new Set(validAssets.map((a) => a.ticker.trim().toUpperCase())));
}

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
  }).then((r) => unwrapEngineData(r));
}

export async function executeGoalOptimizeWithFetch(request: GoalOptimizerRequest) {
  const tickers = validateGoalOptimizerAssets(request);
  const endDateStr = todayStr();
  const startDateStr = toDateStr(new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000));
  return runAnalysisWithFetch(Array.from(new Set(tickers)), startDateStr, endDateStr, (priceData) =>
    executeGoalOptimize(request, priceData, startDateStr, endDateStr),
  );
}
