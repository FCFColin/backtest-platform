/**
 * 回测应用服务。编排：领域校验 → 数据获取 → 引擎调用 → 事件发布。
 *
 * 仅负责组合回测（POST /api/backtest/portfolio）的业务编排。
 * 分析、蒙特卡洛、优化已拆分到各自的应用服务：
 *   - analysis-service.ts:  单资产分析、PCA、LETF、目标优化
 *   - montecarlo-service.ts: 蒙特卡洛模拟
 *   - optimize-service.ts:   组合优化 + 有效前沿 + 回测优化器
 *
 * 共享工具函数在 backtest-helpers.ts 中。
 */
import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from './backtest/engineBodyBuilder.js';
import { getClient } from '../db/pool.js';
import { writeEventInTransaction } from '../infrastructure/outboxWriter.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest, recordDegradedResponse } from '../utils/metrics.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import { eventDispatcher } from '../domain/events/index.js';
import { withTimeout } from '../utils/timeout.js';
import { config } from '../config/index.js';
import { compressBacktestResultForSync } from './backtest/compressBacktestResult.js';
import { backtestCacheKey, setBacktestResultCache } from './backtest/backtestResultCache.js';
import type { BacktestExecutionParams, BacktestExecutionResult } from './backtest-helpers.js';
import type { Portfolio, BacktestParameters, BacktestResult } from '@backtest/shared';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
  fetchPriceData,
  loadMacroData,
  translateDomainError,
  collectDomainTickers,
  filterPriceData,
} from './backtest-helpers.js';

const tracer = trace.getTracer('backtest-platform', '1.0.0');

/**
 * 组合回测完整编排（薄路由调用的入口）。
 *
 * 职责：领域校验 → 数据获取 → 无效标的检测 → 宏观数据加载 →
 *       引擎调用（带超时）→ 缓存写入 → 结果压缩 → 返回
 *
 * @returns 压缩后的回测结果 + 警告列表
 * @throws {ValidationError} 日期格式或标的格式非法
 * @throws {EngineUnavailableError} Go 引擎不可用时（ADR-031 fail-closed）
 */
export async function runPortfolioBacktest(opts: {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  tenantId?: string;
  ownerUserId?: string;
}): Promise<{ result: unknown; warnings: string[] }> {
  const { portfolios, parameters, tenantId, ownerUserId } = opts;

  const prep = preparePortfolioBacktest(portfolios, parameters);
  const { allTickers, warnings } = prep;

  const priceData = await fetchPriceData(
    Array.from(allTickers),
    parameters.startDate,
    parameters.endDate,
  );

  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);

  if (invalidTickers.length > 0) {
    throw new Error(`INVALID_TICKERS: 以下标的代码无效：${invalidTickers.join(', ')}`);
  }

  const { cpiData, exchangeRates } = await loadMacroData(parameters);
  const { result } = await withTimeout(
    runBacktest({
      portfolios,
      parameters,
      priceData,
      cpiData,
      exchangeRates,
      tenantId,
      ownerUserId,
    }),
    config.BACKTEST_SYNC_TIMEOUT_MS,
    'portfolio-backtest',
  );

  const cacheKey = backtestCacheKey(portfolios, parameters, tenantId);
  void setBacktestResultCache(cacheKey, result);

  return { result: compressBacktestResultForSync(result), warnings };
}

/**
 * 运行组合回测。
 *
 * 先通过 domain 层验证组合不变量（权重和=100、无非负权重），
 * 再调用 Go 引擎计算，最后发布 BacktestCompleted 领域事件。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时（ADR-031 fail-closed）
 * @throws {Error} 组合权重校验失败时
 */
export async function runBacktest(
  params: BacktestExecutionParams,
): Promise<BacktestExecutionResult> {
  const { portfolios, parameters, priceData, cpiData, exchangeRates } = params;

  // DDD: 将 DTO 转为领域聚合根 — 构造时自动校验不变量（权重和、Ticker格式、Weight范围）
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
      const degraded = false;

      const firstStats = result.portfolios[0]?.statistics;
      const aggregateId = `backtest-${Date.now()}`;
      const eventId = randomUUID();
      const eventPayload = {
        startingValue: parameters.startingValue,
        portfolioCount: portfolios.length,
        totalReturn: firstStats?.totalReturn,
        maxDrawdown: firstStats?.maxDrawdown,
        sharpeRatio: firstStats?.sharpe,
        degraded,
        tenantId: params.tenantId,
        ownerUserId: params.ownerUserId,
      };

      publishBacktestEvent(aggregateId, eventId, eventPayload);

      logger.info('Backtest completed');
      recordBacktestRequest('portfolio', 'sync', 'success');
      if (degraded) {
        recordDegradedResponse('portfolio', 'engine_fallback');
      }
      return { result, degraded };
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// 模块级私有函数
// ---------------------------------------------------------------------------

/**
 * 发布 BacktestCompleted 领域事件。
 *
 * 双通道发布：
 * 1. eventDispatcher.dispatch() — 进程内同步分发，BacktestCompletedHandler 持久化摘要到 backtest_runs
 * 2. writeBacktestEventToOutbox() — 事务写入 outbox 表，由 OutboxPublisher 异步消费
 *
 * 两个通道独立，一个失败不影响另一个。outbox 保证最终一致性，dispatcher 保证即时副作用。
 */
function publishBacktestEvent(
  aggregateId: string,
  eventId: string,
  eventPayload: Record<string, unknown>,
): void {
  // 通道 1：进程内分发 — 持久化回测运行摘要
  void eventDispatcher
    .dispatch({
      eventType: 'BacktestCompleted',
      aggregateType: 'BacktestSession',
      aggregateId,
      payload: eventPayload,
      occurredAt: new Date(),
    })
    .catch((err) => {
      logger.error({ err, aggregateId }, 'Failed to dispatch BacktestCompleted event');
    });

  // 通道 2：outbox 事务写入 — 最终一致性保证
  void writeBacktestEventToOutbox(aggregateId, eventId, eventPayload).catch((err) => {
    logger.error({ err, aggregateId }, 'Failed to write BacktestCompleted event to outbox');
  });
}

/**
 * 将 BacktestCompleted 事件写入 outbox 表。
 *
 * 在事务中写入事件并 NOTIFY outbox_channel，失败时回滚并释放连接。
 */
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
