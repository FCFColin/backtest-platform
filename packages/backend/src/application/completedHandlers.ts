import { logger } from '../utils/logger.js';
import { createRun } from '../repositories/backtestRunRepo.js';
import { RUN_COMPLETED_EVENT } from '../domain/events/events.js';
import type { EventHandler, DomainEvent } from '../domain/events/events.js';

export class BacktestCompletedHandler implements EventHandler {
  readonly eventType = 'BacktestCompleted';

  async handle(event: DomainEvent): Promise<void> {
    const {
      tenantId,
      ownerUserId,
      portfolioCount,
      totalReturn,
      maxDrawdown,
      sharpeRatio,
      startingValue,
    } = event.payload;

    logger.info(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        totalReturn,
        maxDrawdown,
        sharpeRatio,
      },
      '[BacktestCompletedHandler] 回测完成事件已接收，持久化运行摘要',
    );

    if (!tenantId) {
      logger.warn(
        { aggregateId: event.aggregateId },
        '[BacktestCompletedHandler] 事件缺少 tenantId，跳过持久化',
      );
      return;
    }

    try {
      await createRun(tenantId as string, (ownerUserId as string) ?? null, {
        name: `Backtest ${event.aggregateId}`,
        request: {
          portfolioCount,
          startingValue,
        },
        result: {
          totalReturn,
          maxDrawdown,
          sharpeRatio,
        },
        status: 'completed',
      });
      logger.info(
        { aggregateId: event.aggregateId },
        '[BacktestCompletedHandler] 回测运行摘要已持久化到 backtest_runs',
      );
    } catch (err) {
      logger.error(
        { err, aggregateId: event.aggregateId },
        '[BacktestCompletedHandler] 持久化回测运行摘要失败',
      );
    }
  }
}

export class RunCompletedHandler implements EventHandler {
  readonly eventType = RUN_COMPLETED_EVENT;

  async handle(event: DomainEvent): Promise<void> {
    const { name, portfolioId, ownerUserId } = event.payload;

    logger.info(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        runName: name,
        portfolioId,
        ownerUserId,
      },
      '[RunCompletedHandler] Run 聚合根已进入 completed 态（持久化由 worker 完成）',
    );
  }
}
