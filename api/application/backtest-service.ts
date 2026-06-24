// DDD: Application Service — 编排回测执行流程，不包含业务规则
// 企业为何需要：路由直接调用引擎导致业务逻辑泄漏到 HTTP 层，
// 分层后路由只负责 HTTP 适配，回测执行（引擎调用 + 事件发布）集中到服务层。
// 权衡：增加一层间接调用，但分层后各层职责清晰，引擎调用与事件发布可独立测试。

import { runPortfolioBacktest, type PriceData } from '../engine/portfolio.js';
import { callRustWithFallback, unwrapFallbackResult } from '../utils/rustFallback.js';
import { buildRustPortfolioBody, buildRustParams } from '../utils/rustBodyBuilder.js';
import { eventDispatcher } from '../domain/events/index.js';
import { getClient } from '../db/index.js';
import { writeEventInTransaction } from '../services/outboxWriter.js';
import { logger } from '../utils/logger.js';
import type {
  Portfolio,
  BacktestParameters,
  BacktestResult,
} from '../../shared/types.js';

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
 * 编排回测执行流程：引擎调用（Go/Rust 优先，Node.js 降级）+ 领域事件发布。
 * 路由层只负责 HTTP 适配（请求校验、数据获取、响应格式化），
 * 回测核心执行逻辑集中到此服务，确保业务逻辑不泄漏到 HTTP 层。
 */
export class BacktestApplicationService {
  /**
   * 运行组合回测
   *
   * 1. 构造 Rust 引擎请求体（过滤无关价格数据，减少序列化开销）
   * 2. 通过 callRustWithFallback 调用引擎（Go → Rust → Node.js 降级链）
   * 3. 解包降级响应，提取实际结果与降级标记
   * 4. 发布 BacktestCompleted 领域事件（触发审计、通知等副作用）
   *
   * @param params - 回测执行参数（组合、参数、价格数据、宏观数据）
   * @returns 回测结果与降级标记
   */
  async runBacktest(params: BacktestExecutionParams): Promise<BacktestExecutionResult> {
    const { portfolios, parameters, priceData, cpiData, exchangeRates } = params;

    logger.info(
      { portfolioCount: portfolios.length, startDate: parameters.startDate, endDate: parameters.endDate },
      'Starting backtest',
    );

    // 收集所有 ticker（含 benchmark），用于过滤发送到 Rust 引擎的价格数据
    const allTickers = new Set<string>();
    for (const portfolio of portfolios) {
      for (const asset of portfolio.assets) {
        allTickers.add(asset.ticker);
      }
    }
    if (parameters.benchmarkTicker) {
      allTickers.add(parameters.benchmarkTicker);
    }

    // 过滤价格数据，只保留需要的 ticker（减少 Rust 引擎序列化与传输开销）
    const filteredPriceData: Record<string, Record<string, number>> = {};
    for (const ticker of allTickers) {
      if (priceData[ticker]) {
        filteredPriceData[ticker] = priceData[ticker];
      }
    }

    // 构造 Rust 引擎请求体
    const rustBody = {
      portfolios: portfolios.map(p => buildRustPortfolioBody(p)),
      priceData: filteredPriceData,
      params: buildRustParams(parameters),
      cpiData,
      exchangeRates,
    };

    // 调用引擎：Go/Rust 优先，失败时降级到 Node.js（runPortfolioBacktest）
    const rawResult = await callRustWithFallback(
      '/api/engine/backtest',
      rustBody,
      () => runPortfolioBacktest(portfolios, priceData, parameters, cpiData, exchangeRates),
    );
    const { data: result, degraded } = unwrapFallbackResult(rawResult);

    // 发布 BacktestCompleted 领域事件（ADR-013）
    // 事件包含关键指标摘要，供审计处理器与 OutboxPublisher 消费
    const firstStats = result.portfolios[0]?.statistics;
    const aggregateId = `backtest-${Date.now()}`;
    const eventPayload = {
      startingValue: parameters.startingValue,
      portfolioCount: portfolios.length,
      totalReturn: firstStats?.totalReturn,
      maxDrawdown: firstStats?.maxDrawdown,
      sharpeRatio: firstStats?.sharpe,
      degraded,
    };

    // Task 11.3：事务性 outbox 写入
    // 企业为何需要：原实现通过 eventDispatcher → BacktestCompletedHandler 写 outbox，
    // 该路径不在事务内，回测结果若未来落库则可能与事件不一致。
    // 此处将 outbox 写入包裹在事务中，保证事件记录的原子性。
    // 权衡：回测计算本身是内存操作（非 DB 写），当前事务仅包含 outbox 写入；
    // 若未来回测结果落库，该写入应放入同一事务，实现真正的业务-事件双写一致。
    // outbox 写入失败不阻塞回测主流程（仅记录错误），因为回测结果已计算完成。
    try {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await writeEventInTransaction(client, {
          aggregateType: 'BacktestSession',
          aggregateId,
          eventType: 'BacktestCompleted',
          payload: { ...eventPayload, occurredAt: new Date().toISOString() },
        });
        await client.query('COMMIT');
        // COMMIT 后发送 NOTIFY，唤醒 OutboxPublisher 处理新事件
        // （事务内的 NOTIFY 只在 COMMIT 时生效，故放在 COMMIT 之后显式发送更清晰）
        await client.query('NOTIFY outbox_channel');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, aggregateId }, 'Failed to write BacktestCompleted event to outbox (transactional)');
      } finally {
        client.release();
      }
    } catch (err) {
      // getClient() 失败（连接池耗尽等）不阻塞回测主流程
      logger.error({ err, aggregateId }, 'Failed to acquire client for transactional outbox write');
    }

    // 仍通过 eventDispatcher 分发事件给进程内处理器（日志、指标等非 outbox 副作用）
    // 注意：BacktestCompletedHandler 仍会以非事务方式写一次 outbox（向后兼容），
    // OutboxPublisher 的幂等处理（基于事件内容）可容忍重复事件。
    await eventDispatcher.dispatch({
      eventType: 'BacktestCompleted',
      aggregateType: 'BacktestSession',
      aggregateId,
      payload: eventPayload,
      occurredAt: new Date(),
    });

    logger.info('Backtest completed');
    return { result, degraded };
  }
}

export const backtestApplicationService = new BacktestApplicationService();
