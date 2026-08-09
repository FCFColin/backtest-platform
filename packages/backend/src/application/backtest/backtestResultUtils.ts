import crypto from 'node:crypto';
import type {
  BacktestResult,
  PortfolioResult,
  Portfolio,
  BacktestParameters,
} from '@backtest/shared/types';
import { recordCacheHit } from '../../utils/metrics.js';
import { appRedis, getRedisHealth } from '../../infrastructure/redisClient.js';
import { silentRedis } from '../../infrastructure/redisGuard.js';

export const MAX_SYNC_CHART_POINTS = 400;
const MAX_CHART_POINTS = 800;
const SYNC_OMIT_PORTFOLIO_FIELDS = [
  'allocationHistory',
  'drawdownEpisodes',
  'rollingReturns',
] as const;
type OmitField = (typeof SYNC_OMIT_PORTFOLIO_FIELDS)[number];

function omitPortfolioFields(
  portfolio: PortfolioResult,
  fields: readonly OmitField[],
): PortfolioResult {
  const next = { ...portfolio };
  for (const field of fields) delete (next as Record<string, unknown>)[field];
  return next;
}

function chartSampleIndices(length: number, maxPoints: number): number[] {
  if (length <= maxPoints) return Array.from({ length }, (_, i) => i);
  const indices: number[] = [];
  const step = (length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) indices.push(Math.round(i * step));
  return indices;
}

function downsampleByIndices<T>(arr: T[], indices: number[]): T[] {
  return indices.map((i) => arr[i]);
}

function compressPortfolio(portfolio: PortfolioResult, maxPoints: number): PortfolioResult {
  const growthCurve = portfolio.growthCurve ?? [];
  const n = growthCurve.length;
  if (n <= maxPoints) return portfolio;
  const indices = chartSampleIndices(n, maxPoints);
  return {
    ...portfolio,
    growthCurve: downsampleByIndices(growthCurve, indices),
    drawdownCurve: downsampleByIndices(portfolio.drawdownCurve ?? [], indices),
    rollingReturns: downsampleByIndices(portfolio.rollingReturns ?? [], indices),
    allocationHistory: portfolio.allocationHistory
      ? downsampleByIndices(portfolio.allocationHistory, indices)
      : portfolio.allocationHistory,
    drag: portfolio.drag
      ? {
          ...portfolio.drag,
          dragSeries: downsampleByIndices(portfolio.drag.dragSeries ?? [], indices),
        }
      : portfolio.drag,
  };
}

export function compressBacktestResult(
  result: BacktestResult,
  maxPoints = MAX_CHART_POINTS,
): BacktestResult {
  const portfolios = Array.isArray(result.portfolios) ? result.portfolios : [];
  const compressed: BacktestResult = {
    ...result,
    portfolios: portfolios.map((p) => compressPortfolio(p, maxPoints)),
  };
  if (result.benchmarkGrowth && result.benchmarkGrowth.length > maxPoints) {
    const indices = chartSampleIndices(result.benchmarkGrowth.length, maxPoints);
    compressed.benchmarkGrowth = downsampleByIndices(result.benchmarkGrowth, indices);
  }
  return compressed;
}

export function compressBacktestResultForSync(result: BacktestResult): BacktestResult {
  const compressed = compressBacktestResult(result, MAX_SYNC_CHART_POINTS);
  return {
    ...compressed,
    portfolios: compressed.portfolios.map((p) =>
      omitPortfolioFields(p, SYNC_OMIT_PORTFOLIO_FIELDS),
    ),
  };
}

export function extractBacktestSeries(
  result: BacktestResult,
  series: string[],
): Partial<PortfolioResult>[] {
  const want = new Set(series);
  return result.portfolios.map((p) => {
    const slice: Partial<PortfolioResult> & { name: string } = { name: p.name };
    const compressed = compressPortfolio(p, MAX_CHART_POINTS);
    if (want.has('rollingReturns')) slice.rollingReturns = compressed.rollingReturns;
    if (want.has('allocationHistory')) slice.allocationHistory = compressed.allocationHistory;
    if (want.has('drawdownEpisodes')) slice.drawdownEpisodes = p.drawdownEpisodes;
    return slice;
  });
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 50;
const BACKTEST_CACHE_REDIS_PREFIX = 'backtest_cache:';
const BACKTEST_CACHE_TTL_SEC = 300;

interface CacheEntry {
  result: BacktestResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

export function backtestCacheKey(
  portfolios: Portfolio[],
  parameters: BacktestParameters,
  tenantId: string | undefined,
): string {
  const payload = JSON.stringify({ tenantId, portfolios, parameters });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function setBacktestResultCache(key: string, result: BacktestResult): Promise<void> {
  evictExpired();
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
  if (!(await getRedisHealth())) return;
  await silentRedis(
    () =>
      appRedis.set(
        `${BACKTEST_CACHE_REDIS_PREFIX}${key}`,
        JSON.stringify(result),
        'EX',
        BACKTEST_CACHE_TTL_SEC,
      ),
    '[backtestCache] Redis 写入失败',
    { key },
  );
}

export async function getBacktestResultCache(key: string): Promise<BacktestResult | null> {
  evictExpired();
  const entry = cache.get(key);
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
    } else {
      cache.delete(key);
      cache.set(key, entry);
      recordCacheHit('backtest_result_cache', true);
      return entry.result;
    }
  }
  if (!(await getRedisHealth())) {
    recordCacheHit('backtest_result_cache', false);
    return null;
  }
  const raw = await silentRedis(
    () => appRedis.get(`${BACKTEST_CACHE_REDIS_PREFIX}${key}`),
    '[backtestCache] Redis 读取失败',
    { key },
  );
  if (raw) {
    const result = JSON.parse(raw) as BacktestResult;
    if (!cache.has(key)) cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
    recordCacheHit('backtest_result_cache', true);
    return result;
  }
  recordCacheHit('backtest_result_cache', false);
  return null;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}
