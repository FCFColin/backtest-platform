import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { loadCpiMap } from '../infrastructure/dataServices.js';
import { withTimeout, isValidDate } from '../utils/misc.js';
import { loadExchangeRatesFromDb } from '../db/macroData.js';
import { ValidationError } from '../utils/errors.js';
import { DomainValidationError } from '../domain/value-objects/index.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import type { Portfolio, BacktestParameters, BacktestResult, PriceData } from '@backtest/shared';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';

// 领域异常翻译：domain 层抛 DomainValidationError（无 HTTP 语义），application 层统一翻译为 ValidationError（HTTP 422）

export function translateDomainError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DomainValidationError)
      throw new ValidationError(err.message, 'VALIDATION_ERROR', 'Portfolio validation failed');
    throw err;
  }
}

export interface BacktestExecutionParams {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  priceData: PriceData;
  cpiData?: Record<string, number>;
  exchangeRates?: Record<string, number>;
  tenantId?: string;
  /** 提交者用户 ID，用于领域事件审计（可选） */ ownerUserId?: string;
}
export interface BacktestExecutionResult {
  result: BacktestResult;
}
export interface Warning {
  code: string;
  message?: string;
  tickers?: string[];
}
export interface DateRangeInfo {
  requested: { start: string; end: string };
  actual: { start: string; end: string };
  clamped: boolean;
  missingTickers?: string[];
}
interface PortfolioBacktestPrep {
  allTickers: Set<string>;
  warnings: Warning[];
}

function portfolioToDomain(raw: Portfolio): DomainPortfolio {
  return translateDomainError(() => DomainPortfolio.fromDTO(raw));
}

/** 校验日期格式与 ticker 数量，收集回测所需标的集合。 */
export function preparePortfolioBacktest(
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): PortfolioBacktestPrep {
  if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate))
    throw new ValidationError('Invalid date format, expected YYYY-MM-DD');
  const domainPortfolios = portfolios.map(portfolioToDomain);
  const allTickers = new Set<string>();
  let totalAssets = 0;
  for (const portfolio of domainPortfolios) {
    for (const ticker of portfolio.tickers) allTickers.add(ticker);
    totalAssets += portfolio.holdingCount;
  }
  if (portfolios.length > MAX_TICKERS || totalAssets > MAX_TICKERS)
    throw new ValidationError(`Portfolio or asset count exceeds limit (max ${MAX_TICKERS})`);
  if (parameters.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);
  return { allTickers, warnings: [] as Warning[] };
}

/** 根据 priceData 识别无效 ticker，填充 warnings。 */
export function collectInvalidTickerWarnings(
  allTickers: Set<string>,
  priceData: Record<string, unknown>,
  warnings: Warning[],
): string[] {
  const invalidTickers: string[] = [];
  for (const ticker of allTickers) {
    const series = priceData[ticker];
    if (!series || (typeof series === 'object' && Object.keys(series as object).length === 0))
      invalidTickers.push(ticker);
  }
  if (invalidTickers.length > 0)
    warnings.push({ code: 'TICKER_NOT_FOUND', tickers: invalidTickers });
  return invalidTickers;
}

/** 数据服务降级时追加 DATA_DEGRADED warning（消除 5 处重复的降级告警样板）。 */
export function pushDegradedWarning(
  warnings: Warning[],
  degraded: boolean,
  degradedWarning?: string,
): void {
  if (degraded)
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
}

export function clampParametersToDataRange<
  T extends Pick<BacktestParameters, 'startDate' | 'endDate'>,
>(parameters: T, effectiveStartDate: string, effectiveEndDate: string): T {
  return effectiveStartDate !== parameters.startDate || effectiveEndDate !== parameters.endDate
    ? { ...parameters, startDate: effectiveStartDate, endDate: effectiveEndDate }
    : parameters;
}

export function collectDomainTickers(
  domainPortfolios: DomainPortfolio[],
  benchmarkTicker: string,
): Set<string> {
  const allTickers = new Set<string>();
  for (const portfolio of domainPortfolios) {
    for (const ticker of portfolio.tickers) allTickers.add(ticker);
  }
  if (benchmarkTicker) allTickers.add(benchmarkTicker);
  return allTickers;
}

export function filterPriceData(
  priceData: PriceData,
  tickers: Set<string>,
): Record<string, Record<string, number>> {
  const filtered: Record<string, Record<string, number>> = {};
  for (const ticker of tickers) if (priceData[ticker]) filtered[ticker] = priceData[ticker];
  return filtered;
}

function inferDateRangeFromData(
  data: Record<string, Record<string, number>>,
): { min: string; max: string } | null {
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const series of Object.values(data)) {
    for (const d of Object.keys(series)) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }
  return minDate && maxDate ? { min: minDate, max: maxDate } : null;
}

export function calculateDateRange(
  startDate: string,
  endDate: string,
  priceData: Record<string, Record<string, number>>,
  missingTickers?: string[],
): DateRangeInfo {
  const inferredRange = inferDateRangeFromData(priceData);
  const effectiveStartDate = inferredRange?.min ?? startDate;
  const effectiveEndDate = inferredRange?.max ?? endDate;
  let clamped = false;
  if (startDate !== '' || endDate !== '') {
    if (startDate && effectiveStartDate > startDate) clamped = true;
    if (endDate && effectiveEndDate < endDate) clamped = true;
  }
  const range: DateRangeInfo = {
    requested: { start: startDate, end: endDate },
    actual: { start: effectiveStartDate, end: effectiveEndDate },
    clamped,
  };
  if (missingTickers && missingTickers.length > 0) range.missingTickers = missingTickers;
  return range;
}

export async function fetchPriceDataWithRange(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<{
  priceData: Record<string, Record<string, number>>;
  effectiveStartDate: string;
  effectiveEndDate: string;
  degraded: boolean;
  degradedWarning?: string;
}> {
  const result = await withTimeout(
    fetchHistoryData(tickers, startDate, endDate),
    60_000,
    'fetch-history-data',
  );
  let effectiveStart = startDate;
  let effectiveEnd = endDate;
  if (Object.keys(result.data).length > 0) {
    const range = inferDateRangeFromData(result.data);
    if (range) {
      effectiveStart = range.min;
      effectiveEnd = range.max;
    }
  }
  return {
    priceData: result.data,
    effectiveStartDate: effectiveStart,
    effectiveEndDate: effectiveEnd,
    degraded: result.degraded,
    degradedWarning: result.degradedWarning,
  };
}

export async function preparePriceDataAndWarnings(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<{
  priceData: Record<string, Record<string, number>>;
  warnings: Warning[];
  invalidTickers: string[];
  effectiveStartDate: string;
  effectiveEndDate: string;
  allTickers: Set<string>;
}> {
  const warnings: Warning[] = [];
  const { priceData, effectiveStartDate, effectiveEndDate, degraded, degradedWarning } =
    await fetchPriceDataWithRange(tickers, startDate, endDate);
  const allTickers = new Set(tickers);
  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);
  pushDegradedWarning(warnings, degraded, degradedWarning);
  return { priceData, warnings, invalidTickers, effectiveStartDate, effectiveEndDate, allTickers };
}

export async function loadMacroData(
  parameters: BacktestParameters,
): Promise<{ cpiData: Record<string, number>; exchangeRates: Record<string, number> }> {
  const baseCurrency = parameters.baseCurrency || 'usd';
  const cpiData = parameters.adjustForInflation
    ? await loadCpiMap(baseCurrency === 'cny' ? 'cn' : 'us')
    : {};
  const exchangeRates = baseCurrency === 'cny' ? await loadExchangeRatesFromDb() : {};
  return { cpiData, exchangeRates };
}

// 与 Go 引擎 MCSimParams 保持一致（engine-go/internal/montecarlo/types.go）
const MC_PARAMS_ALLOWED_KEYS = new Set([
  'numSimulations',
  'numYears',
  'minBlockYears',
  'maxBlockYears',
  'successThreshold',
]);

export function sanitizeMcParams(
  mcParams: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(mcParams))
    if (MC_PARAMS_ALLOWED_KEYS.has(key)) sanitized[key] = mcParams[key];
  return sanitized;
}
