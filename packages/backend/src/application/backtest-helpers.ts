/**
 * 回测工具函数与共享类型。
 *
 * 从 backtest-service.ts 拆分，供 backtest-service / analysis-service /
 * montecarlo-service / optimize-service 共享使用。
 */
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { loadCpiMap } from '../infrastructure/cpiLoader.js';
import { withTimeout } from '../utils/timeout.js';
import { loadExchangeRatesFromDb } from '../db/macroData.js';
import { ValidationError } from '../utils/errors.js';
import { DomainValidationError } from '../domain/errors.js';
import { isValidDate } from '../utils/dateUtils.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import type { Portfolio, BacktestParameters, BacktestResult, PriceData } from '@backtest/shared';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';

// ---------------------------------------------------------------------------
// 领域异常翻译 — domain 层抛出 DomainValidationError（无 HTTP 语义），
// application 层统一翻译为 ValidationError（HTTP 422）供路由层处理。
// ---------------------------------------------------------------------------

/**
 * 执行领域构造操作，将 DomainValidationError 翻译为 ValidationError。
 *
 * @param fn - 调用领域聚合根工厂 / 值对象构造的闭包
 * @returns 闭包返回值
 * @throws {ValidationError} 当领域层抛出 DomainValidationError 时
 */
export function translateDomainError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DomainValidationError) {
      throw new ValidationError(err.message, 'VALIDATION_ERROR', 'Portfolio validation failed');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 请求/响应类型
// ---------------------------------------------------------------------------

export interface BacktestExecutionParams {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  priceData: PriceData;
  cpiData?: Record<string, number>;
  exchangeRates?: Record<string, number>;
  /** 租户 ID，用于领域事件持久化（可选，异步路径必填） */
  tenantId?: string;
  /** 提交者用户 ID，用于领域事件审计（可选） */
  ownerUserId?: string;
}

export interface BacktestExecutionResult {
  result: BacktestResult;
  degraded: boolean;
}

interface PortfolioBacktestPrep {
  allTickers: Set<string>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// DDD 领域映射 — 将请求体原始 Portfolio 转为 DDD 聚合根
// ---------------------------------------------------------------------------

/**
 * 将请求体中的原始 Portfolio 转为 DDD 聚合根（携带完整配置）。
 *
 * 通过 Portfolio.fromDTO() 创建聚合根，构造时自动校验：
 * - Ticker 格式（安全净化）
 * - Weight 范围（0–100 百分比）
 * - 权重和 ≈ 100
 *
 * @throws {ValidationError} 当 ticker 格式非法、权重越界、或权重和偏差 > 1 时
 */
function portfolioToDomain(raw: Portfolio): DomainPortfolio {
  return translateDomainError(() => DomainPortfolio.fromDTO(raw));
}

// ---------------------------------------------------------------------------
// 共享工具函数
// ---------------------------------------------------------------------------

/** 校验日期格式与 ticker 数量，收集回测所需标的集合。 */
export function preparePortfolioBacktest(
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): PortfolioBacktestPrep {
  if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
    throw new ValidationError('Invalid date format, expected YYYY-MM-DD');
  }

  // DDD: 将每个原始 Portfolio 转为聚合根，校验 ticker 格式 + 权重范围 + 权重和
  const domainPortfolios = portfolios.map(portfolioToDomain);

  const allTickers = new Set<string>();
  let totalAssets = 0;
  for (const portfolio of domainPortfolios) {
    for (const ticker of portfolio.tickers) {
      allTickers.add(ticker);
    }
    totalAssets += portfolio.holdingCount;
  }

  if (portfolios.length > MAX_TICKERS || totalAssets > MAX_TICKERS) {
    throw new ValidationError(`组合数量或资产总数超过限制 (max ${MAX_TICKERS})`);
  }
  if (parameters.benchmarkTicker) {
    allTickers.add(parameters.benchmarkTicker);
  }

  return { allTickers, warnings: [] };
}

/** 根据 priceData 识别无效 ticker，填充 warnings。 */
export function collectInvalidTickerWarnings(
  allTickers: Set<string>,
  priceData: Record<string, unknown>,
  warnings: string[],
): string[] {
  const invalidTickers: string[] = [];
  for (const ticker of allTickers) {
    const series = priceData[ticker];
    if (!series || (typeof series === 'object' && Object.keys(series as object).length === 0)) {
      invalidTickers.push(ticker);
    }
  }
  if (invalidTickers.length > 0) {
    warnings.push(`以下标的无价格数据: ${invalidTickers.join(', ')}`);
  }
  return invalidTickers;
}

/** 从组合列表中收集所有唯一 ticker 与资产总数。 */
export function collectTickersFromPortfolios(portfolioList: Portfolio[]): {
  tickers: string[];
  totalAssets: number;
} {
  const allTickers = new Set<string>();
  let totalAssets = 0;
  for (const p of portfolioList) {
    for (const asset of p.assets) allTickers.add(asset.ticker);
    totalAssets += p.assets.length;
  }
  return { tickers: Array.from(allTickers), totalAssets };
}

/** 从领域组合中收集唯一 ticker（含基准标的）。 */
export function collectDomainTickers(
  domainPortfolios: DomainPortfolio[],
  benchmarkTicker: string,
): Set<string> {
  const allTickers = new Set<string>();
  for (const portfolio of domainPortfolios) {
    for (const ticker of portfolio.tickers) {
      allTickers.add(ticker);
    }
  }
  if (benchmarkTicker) {
    allTickers.add(benchmarkTicker);
  }
  return allTickers;
}

/** 过滤 priceData，只保留指定 tickers 的数据。 */
export function filterPriceData(
  priceData: PriceData,
  tickers: Set<string>,
): Record<string, Record<string, number>> {
  const filtered: Record<string, Record<string, number>> = {};
  for (const ticker of tickers) {
    if (priceData[ticker]) {
      filtered[ticker] = priceData[ticker];
    }
  }
  return filtered;
}

/** 带超时地获取历史价格数据。 */
export async function fetchPriceData(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<Record<string, Record<string, number>>> {
  const result = await withTimeout(
    fetchHistoryData(tickers, startDate, endDate),
    60_000,
    'fetch-history-data',
  );
  return result.data;
}

/** 从 priceData 中推断实际日期范围（所有 ticker 的并集）。 */
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

/**
 * 获取历史价格数据并返回实际生效的日期范围。
 *
 * "全部历史"模式下，后端会计算所有 ticker 的公共日期区间作为实际查询范围，
 * 此函数将该区间一并返回，供调用方传给引擎以保持日期过滤一致性。
 */
export async function fetchPriceDataWithRange(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<{
  priceData: Record<string, Record<string, number>>;
  effectiveStartDate: string;
  effectiveEndDate: string;
}> {
  const result = await withTimeout(
    fetchHistoryData(tickers, startDate, endDate),
    60_000,
    'fetch-history-data',
  );
  let effectiveStart = startDate;
  let effectiveEnd = endDate;
  if (startDate === '' && endDate === '' && Object.keys(result.data).length > 0) {
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
  };
}

/** 加载宏观经济数据（CPI + 汇率）。 */
export async function loadMacroData(
  parameters: BacktestParameters,
): Promise<{ cpiData: Record<string, number>; exchangeRates: Record<string, number> }> {
  const baseCurrency = parameters.baseCurrency || 'usd';
  const cpiCountry = baseCurrency === 'cny' ? 'cn' : 'us';
  const cpiData = parameters.adjustForInflation ? await loadCpiMap(cpiCountry) : {};
  const exchangeRates = baseCurrency === 'cny' ? await loadExchangeRatesFromDb() : {};
  return { cpiData, exchangeRates };
}

const MC_PARAMS_ALLOWED_KEYS = new Set([
  'numSimulations',
  'blockSize',
  'withReplacement',
  'confidenceLevel',
  'distribution',
  'seed',
]);

/** 过滤 mcParams 中的未知键，仅保留白名单字段。 */
export function sanitizeMcParams(mcParams: object | undefined): Record<string, unknown> {
  if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
  const raw = mcParams as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (MC_PARAMS_ALLOWED_KEYS.has(key)) sanitized[key] = raw[key];
  }
  return sanitized;
}
