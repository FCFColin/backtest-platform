/**
 * BacktestCompleted 事件处理器
 *
 * ADR-013 / ADR-024：领域事件处理器实现
 *
 * 此处理器是**业务副作用处理器**——回测完成后将摘要持久化到 backtest_runs 表，
 * 使运行历史成为租户级资产，为配额/计量（Phase 7）提供可审计的数据源。
 *
 * Outbox 的唯一写入点仍为 application/backtest-service 的事务写入（ADR-024），
 * 本处理器仅消费已分发的事件，不重复写 outbox，避免反馈环。
 *
 * 分层：位于 application 层（非 domain 层），因为它直接依赖 services/backtestRunRepo
 * 完成持久化副作用；domain 层仅保留事件契约与分发器。
 */

import { logger } from '../../../utils/logger.js';
import { createRun } from '../../../repositories/backtestRunRepo.js';
import type { EventHandler, DomainEvent } from '../../../domain/events/EventDispatcher.js';

/**
 * BacktestCompleted 事件处理器
 *
 * 订阅 'BacktestCompleted' 事件，将回测摘要（关键指标 + 请求快照）持久化到 backtest_runs 表。
 * 持久化失败时仅记录错误日志，不影响主流程（事件处理是 allSettled 语义）。
 */
export class BacktestCompletedHandler implements EventHandler {
  /** 订阅的事件类型，与 BacktestCompleted 接口的 type 字段一致 */
  readonly eventType = 'BacktestCompleted';

  /**
   * 处理 BacktestCompleted 事件：将回测摘要持久化到 backtest_runs 表。
   *
   * @param event - 领域事件，payload 包含 totalReturn/maxDrawdown/sharpeRatio/tenantId/ownerUserId
   */
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
