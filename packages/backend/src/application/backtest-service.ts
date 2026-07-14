// DDD: Application Service — 编排回测执行流程，不包含业务规则
// 企业为何需要：路由直接调用引擎导致业务逻辑泄漏到 HTTP 层，
// 分层后路由只负责 HTTP 适配，回测执行（引擎调用 + 事件发布）集中到服务层。
// 权衡：增加一层间接调用，但分层后各层职责清晰，引擎调用与事件发布可独立测试。

import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEnginePortfolioBody, buildEngineParams } from '../utils/engineBodyBuilder.js';
import { eventDispatcher } from '../domain/events/index.js';
import { getClient } from '../db/index.js';
import { writeEventInTransaction } from '../services/outboxWriter.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest, recordDegradedResponse } from '../utils/metrics.js';
import type {
  Portfolio,
  BacktestParameters,
  BacktestResult,
  PriceData,
} from '@backtest/shared/types';
import { loadCpiMapFromDb, loadExchangeRatesFromDb } from '../db/macroData.js';

/** OTel tracer（无 SDK 初始化时返回 NoopTracer，不影响测试与运行） */
const tracer = trace.getTracer('backtest-platform', '1.0.0');

/** 回测执行入参 */
export interface BacktestExecutionParams {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  priceData: PriceData;
  cpiData?: Record<string, number>;
  exchangeRates?: Record<string, number>;
}

/** 回测执行结果（含降级标记） */
export interface BacktestExecutionResult {
  result: BacktestResult;
  degraded: boolean;
}

/**
 * 回测应用服务
 *
 * 编排回测执行流程：引擎调用（Go 引擎，fail-closed）+ 领域事件发布。
 * 路由层只负责 HTTP 适配（请求校验、数据获取、响应格式化），
 * 回测核心执行逻辑集中到此服务，确保业务逻辑不泄漏到 HTTP 层。
 */
export class BacktestApplicationService {
  /**
   * 运行组合回测
   *
   * 1. 构造引擎请求体（过滤无关价格数据，减少序列化开销）
   * 2. 通过 callEngineStrict 调用 Go 引擎（不可用时 fail-closed 抛错，ADR-031）
   * 3. 发布 BacktestCompleted 领域事件（触发审计、通知等副作用）
   *
   * @param params - 回测执行参数（组合、参数、价格数据、宏观数据）
   * @returns 回测结果（成功路径恒为引擎计算结果，degraded 恒为 false）
   * @throws {EngineUnavailableError} 当 Go 引擎不可用时（ADR-031 fail-closed）
   */
  /** 收集所有 ticker 并过滤价格数据 */
  private collectTickersAndFilterPrices(
    portfolios: Portfolio[],
    benchmarkTicker: string,
    priceData: Record<string, Record<string, number>>,
  ): Record<string, Record<string, number>> {
    const allTickers = new Set<string>();
    for (const portfolio of portfolios) {
      for (const asset of portfolio.assets) {
        allTickers.add(asset.ticker);
      }
    }
    if (benchmarkTicker) {
      allTickers.add(benchmarkTicker);
    }

    const filteredPriceData: Record<string, Record<string, number>> = {};
    for (const ticker of allTickers) {
      if (priceData[ticker]) {
        filteredPriceData[ticker] = priceData[ticker];
      }
    }
    return filteredPriceData;
  }

  /** 异步发布 BacktestCompleted 领域事件（Outbox + EventDispatcher） */
  private publishBacktestEvent(
    aggregateId: string,
    eventId: string,
    eventPayload: Record<string, unknown>,
  ): void {
    void (async () => {
      try {
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
          logger.error(
            { err, aggregateId },
            'Failed to write BacktestCompleted event to outbox (transactional)',
          );
        } finally {
          client.release();
        }
      } catch (err) {
        logger.error(
          { err, aggregateId },
          'Failed to acquire client for transactional outbox write',
        );
      }

      try {
        await eventDispatcher.dispatch({
          eventType: 'BacktestCompleted',
          aggregateType: 'BacktestSession',
          aggregateId,
          payload: eventPayload,
          occurredAt: new Date(),
        });
      } catch (err) {
        logger.error({ err, aggregateId }, 'BacktestCompleted event dispatch failed');
      }
    })();
  }

  async runBacktest(params: BacktestExecutionParams): Promise<BacktestExecutionResult> {
    const { portfolios, parameters, priceData, cpiData, exchangeRates } = params;

    return tracer.startActiveSpan('BacktestApplicationService.runBacktest', async (span) => {
      try {
        const tickerCount = this.countUniqueTickers(portfolios, parameters.benchmarkTicker);
        span.setAttribute('portfolio_count', portfolios.length);
        span.setAttribute('ticker_count', tickerCount);

        logger.info(
          {
            portfolioCount: portfolios.length,
            startDate: parameters.startDate,
            endDate: parameters.endDate,
          },
          'Starting backtest',
        );

        const filteredPriceData = this.collectTickersAndFilterPrices(
          portfolios,
          parameters.benchmarkTicker,
          priceData,
        );

        span.setAttribute('cache_hit', Object.keys(filteredPriceData).length === tickerCount);

        const engineBody = {
          portfolios: portfolios.map((p) => buildEnginePortfolioBody(p)),
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
        };

        this.publishBacktestEvent(aggregateId, eventId, eventPayload);

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

  /** 统计所有组合中唯一 ticker 数量（含 benchmark） */
  private countUniqueTickers(portfolios: Portfolio[], benchmarkTicker: string): number {
    const tickers = new Set<string>();
    for (const portfolio of portfolios) {
      for (const asset of portfolio.assets) {
        tickers.add(asset.ticker);
      }
    }
    if (benchmarkTicker) {
      tickers.add(benchmarkTicker);
    }
    return tickers.size;
  }
}

export const backtestApplicationService = new BacktestApplicationService();

/**
 * 加载宏观经济数据（CPI + 汇率），根据 parameters.baseCurrency 与 adjustForInflation 统一处理。
 *
 * @param parameters - 回测参数，读取 baseCurrency 与 adjustForInflation
 * @returns cpiData 与 exchangeRates（不需要时为空对象）
 */
export async function loadMacroData(
  parameters: BacktestParameters,
): Promise<{ cpiData: Record<string, number>; exchangeRates: Record<string, number> }> {
  const baseCurrency = parameters.baseCurrency || 'usd';
  const cpiCountry = baseCurrency === 'cny' ? 'cn' : 'us';
  const cpiData = parameters.adjustForInflation ? await loadCpiMapFromDb(cpiCountry) : {};
  const exchangeRates = baseCurrency === 'cny' ? await loadExchangeRatesFromDb() : {};
  return { cpiData, exchangeRates };
}
