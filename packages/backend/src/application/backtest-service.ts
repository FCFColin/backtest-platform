/**
 * 回测应用服务：领域校验 → 数据获取 → 引擎调用 → 事件发布。
 * 仅负责组合回测编排；分析/MC/优化在各自服务，共享工具在 backtest-helpers.ts。
 */
import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from './backtest/engineBodyBuilder.js';
import { getClient } from '../db/pool.js';
import { writeEventInTransaction } from '../infrastructure/outboxWriter.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import { Run } from '../domain/aggregates/run.js';
import { eventDispatcher } from '../domain/events/events.js';
import { withTimeout } from '../utils/misc.js';
import { config } from '../config/index.js';
import { compressBacktestResultForSync } from './backtest/compressBacktestResult.js';
import { backtestCacheKey, setBacktestResultCache } from './backtest/backtestResultCache.js';
import type {
  BacktestExecutionParams,
  BacktestExecutionResult,
  Warning,
  DateRangeInfo,
} from './backtest-helpers.js';
import type { Portfolio, BacktestParameters, BacktestResult } from '@backtest/shared';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
  fetchPriceDataWithRange,
  loadMacroData,
  translateDomainError,
  collectDomainTickers,
  filterPriceData,
  calculateDateRange,
} from './backtest-helpers.js';

const tracer = trace.getTracer('backtest-platform', '1.0.0');

export type { DateRangeInfo };

/**
 * 组合回测完整编排：领域校验 → 数据获取 → 无效标的检测 → 宏观数据加载 → 引擎调用（带超时）→ 缓存 → 压缩。
 * @throws {ValidationError} 日期/标的格式非法；{@link EngineUnavailableError} Go 引擎不可用（ADR-031 fail-closed）
 */
export async function runPortfolioBacktest(opts: {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  tenantId?: string;
  ownerUserId?: string;
  /** 进度上报回调（P0-03 异步化）：数据 0-30%、计算 30-90%、写入 90-100%。同步路径不传。 */
  onProgress?: (pct: number) => void;
}): Promise<{ result: unknown; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const { portfolios, parameters, tenantId, ownerUserId, onProgress } = opts;
  onProgress?.(5);
  const { allTickers, warnings } = preparePortfolioBacktest(portfolios, parameters);
  onProgress?.(10);
  const { priceData, effectiveStartDate, effectiveEndDate, degraded, degradedWarning } =
    await fetchPriceDataWithRange(Array.from(allTickers), parameters.startDate, parameters.endDate);
  onProgress?.(30);
  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);
  if (degraded)
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
  const { cpiData, exchangeRates } = await loadMacroData(parameters);
  onProgress?.(35);
  const effectiveParameters =
    effectiveStartDate !== parameters.startDate || effectiveEndDate !== parameters.endDate
      ? { ...parameters, startDate: effectiveStartDate, endDate: effectiveEndDate }
      : parameters;
  const { result } = await withTimeout(
    runBacktest({
      portfolios,
      parameters: effectiveParameters,
      priceData,
      cpiData,
      exchangeRates,
      tenantId,
      ownerUserId,
    }),
    config.BACKTEST_SYNC_TIMEOUT_MS,
    'portfolio-backtest',
  );
  onProgress?.(90);
  const cacheKey = backtestCacheKey(portfolios, parameters, tenantId);
  void setBacktestResultCache(cacheKey, result).catch((err) =>
    logger.error({ err, cacheKey }, '[backtest-service] Failed to set backtest result cache'),
  );
  onProgress?.(100);
  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    invalidTickers,
  );
  return { result: compressBacktestResultForSync(result), warnings, dateRange };
}

/**
 * 运行组合回测：domain 层验证组合不变量 → Go 引擎计算 → 发布 BacktestCompleted 领域事件。
 * @throws {EngineUnavailableError} Go 引擎不可用（ADR-031 fail-closed）
 */
export async function runBacktest(
  params: BacktestExecutionParams,
): Promise<BacktestExecutionResult> {
  const { portfolios, parameters, priceData, cpiData, exchangeRates } = params;
  // DDD：DTO → 领域聚合根，构造时自动校验不变量（权重和、Ticker 格式、Weight 范围）
  const domainPortfolios = portfolios.map((p) =>
    translateDomainError(() => DomainPortfolio.fromDTO(p)),
  );
  return tracer.startActiveSpan('BacktestApplicationService.runBacktest', async (span) => {
    try {
      const allTickers = collectDomainTickers(domainPortfolios, parameters.benchmarkTicker);
      span.setAttribute('portfolio_count', portfolios.length);
      span.setAttribute('ticker_count', allTickers.size);
      logger.info(
        {
          portfolioCount: portfolios.length,
          startDate: parameters.startDate,
          endDate: parameters.endDate,
        },
        'Starting backtest',
      );
      // ADR-013 Phase 3：Run 聚合根触发 RunStarted 事件（同步路径不持久化 Run，落库摘要由 BacktestCompletedHandler 完成）
      const aggregateId = `backtest-${Date.now()}`;
      const run = Run.create({
        id: aggregateId,
        name: `Backtest ${aggregateId}`,
        request: {
          portfolioCount: portfolios.length,
          startDate: parameters.startDate,
          endDate: parameters.endDate,
        },
        ownerUserId: params.ownerUserId,
      });
      for (const evt of run.pullEvents())
        void eventDispatcher
          .dispatch(evt)
          .catch((err) =>
            logger.error({ err, aggregateId }, 'Failed to dispatch RunStarted event'),
          );
      const filteredPriceData = filterPriceData(priceData, allTickers);
      span.setAttribute('cache_hit', Object.keys(filteredPriceData).length === allTickers.size);
      const engineBody = {
        portfolios: domainPortfolios.map((p) => p.toEngineBody()),
        priceData: filteredPriceData,
        params: buildEngineParams(parameters),
        cpiData,
        exchangeRates,
      };
      const result = await callEngineStrict<BacktestResult>('/api/engine/backtest', engineBody);
      const firstStats = result.portfolios[0]?.statistics;
      const eventPayload = {
        startingValue: parameters.startingValue,
        portfolioCount: portfolios.length,
        totalReturn: firstStats?.totalReturn,
        maxDrawdown: firstStats?.maxDrawdown,
        sharpeRatio: firstStats?.sharpe,
        tenantId: params.tenantId,
        ownerUserId: params.ownerUserId,
      };
      publishBacktestEvent(aggregateId, randomUUID(), eventPayload);
      logger.info('Backtest completed');
      recordBacktestRequest('portfolio', 'sync', 'success');
      return { result };
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** 双通道发布 BacktestCompleted：进程内分发（即时副作用）+ outbox 事务写入（最终一致性），互不影响。 */
function publishBacktestEvent(
  aggregateId: string,
  eventId: string,
  eventPayload: Record<string, unknown>,
): void {
  void eventDispatcher
    .dispatch({
      eventType: 'BacktestCompleted',
      aggregateType: 'BacktestSession',
      aggregateId,
      payload: eventPayload,
      occurredAt: new Date(),
    })
    .catch((err) =>
      logger.error({ err, aggregateId }, 'Failed to dispatch BacktestCompleted event'),
    );
  void writeBacktestEventToOutbox(aggregateId, eventId, eventPayload).catch((err) =>
    logger.error({ err, aggregateId }, 'Failed to write BacktestCompleted event to outbox'),
  );
}

async function writeBacktestEventToOutbox(
  aggregateId: string,
  eventId: string,
  eventPayload: Record<string, unknown>,
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await writeEventInTransaction(client, {
      aggregateType: 'BacktestSession',
      aggregateId,
      eventType: 'BacktestCompleted',
      payload: { ...eventPayload, occurredAt: new Date().toISOString() },
      eventId,
    });
    await client.query('COMMIT');
    await client.query('NOTIFY outbox_channel');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
