import type {
  PCARequest,
  GoalOptimizerRequest,
  PCAResult,
  BacktestParameters,
} from '@backtest/shared/types/index';
import type { LETFRequest } from '@backtest/shared';
import { callEngineStrict } from '../utils/engineClient.js';
import {
  analysisResultSchema,
  pcaResultSchema,
  letfResultSchema,
  goalOptimizeResultSchema,
} from '../schemas/engineSchemas.js';
import { logger } from '../utils/logger.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { ValidationError } from '../utils/errors.js';
import { toDateStr, todayStr } from '../utils/misc.js';
import { ensurePriceDataExists, normalizeTickers } from './backtest/backtestEngineUtils.js';
import { preparePriceDataAndWarnings } from './backtest-helpers.js';
import type { Warning, DateRangeInfo, DegradedResult } from './backtest-helpers.js';

export async function runAnalysis(
  tickers: string[],
  parameters: BacktestParameters,
): Promise<{ data: Record<string, unknown>; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const { priceData, warnings, invalidTickers, dateRange } = await preparePriceDataAndWarnings(
    tickers,
    parameters.startDate,
    parameters.endDate,
  );
  if (Object.keys(priceData).length === 0) {
    throw new ValidationError(`Price data unavailable for all tickers: ${tickers.join(', ')}`);
  }
  if (invalidTickers.length > 0) {
    logger.warn(`[analysis] 部分标的价格数据缺失，已忽略: ${invalidTickers.join(', ')}`);
  }

  const result = await callEngineStrict<Record<string, unknown>>(
    '/api/engine/analysis',
    {
      tickers: tickers.filter((t) => priceData[t] && Object.keys(priceData[t]).length > 0),
      priceData,
      params: buildEngineParams(parameters),
    },
    analysisResultSchema,
  );

  const engineData = result as { assets?: unknown[]; correlations?: unknown[][] };
  const data = engineData?.assets
    ? { tickers: engineData.assets, correlations: engineData.correlations || [] }
    : { ...result };
  return { data, warnings, dateRange };
}

export function executePcaAnalyze(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  numComponents?: number,
) {
  ensurePriceDataExists(tickers, priceData, 'PCA');
  return callEngineStrict<PCAResult>(
    '/api/engine/pca',
    {
      tickers,
      priceData,
      numComponents,
    },
    pcaResultSchema,
  );
}

async function runAnalysisWithFetch<T>(
  tickers: string[],
  startDate: string,
  endDate: string,
  run: (priceData: Record<string, Record<string, number>>) => Promise<T>,
): Promise<DegradedResult<T> & { warnings: Warning[] }> {
  const { priceData, warnings, degraded, degradedWarning } = await preparePriceDataAndWarnings(
    tickers,
    startDate,
    endDate,
  );
  return { data: await run(priceData), warnings, degraded, degradedWarning };
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

  ensurePriceDataExists([cleanLetf], priceData, '杠杆 ETF');
  ensurePriceDataExists([cleanBench], priceData, '基准指数');

  return callEngineStrict(
    '/api/engine/letf-analyze',
    {
      letfTicker: cleanLetf,
      benchmarkTicker: cleanBench,
      leverage: lev,
      priceData,
    },
    letfResultSchema,
  );
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

  const weightByTicker = new Map<string, number>();
  for (const asset of request.assets) {
    const t = asset.ticker.trim().toUpperCase();
    if (!weightByTicker.has(t)) weightByTicker.set(t, asset.weight);
  }

  return callEngineStrict(
    '/api/engine/goal-optimize',
    {
      ...request,
      // assets ticker 须与 priceData 键（trim+uppercase）一致，否则引擎端按 Ticker 查 priceData 会漏配
      assets: tickers.map((ticker) => ({ ticker, weight: weightByTicker.get(ticker) ?? 0 })),
      priceData,
      startDate,
      endDate,
    },
    goalOptimizeResultSchema,
  );
}

export async function executeGoalOptimizeWithFetch(request: GoalOptimizerRequest) {
  const tickers = validateGoalOptimizerAssets(request);
  const endDateStr = todayStr();
  const startDateStr = toDateStr(new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000));
  return runAnalysisWithFetch(Array.from(new Set(tickers)), startDateStr, endDateStr, (priceData) =>
    executeGoalOptimize(request, priceData, startDateStr, endDateStr),
  );
}
