/**
 * 回测完成类事件处理器（ADR-013 / ADR-024）
 *
 * 两个处理器的关键区别：
 *   - BacktestCompletedHandler：监听 BacktestCompleted（由 backtest-service 在引擎返回后分发），
 *     负责将回测摘要**首次持久化**到 backtest_runs 表，使运行历史成为租户级资产，为配额/计量
 *     （Phase 7）提供可审计的数据源。Outbox 唯一写入点仍为 application/backtest-service 的事务
 *     写入（ADR-024），本处理器仅消费已分发的事件，不重复写 outbox，避免反馈环。
 *   - RunCompletedHandler：监听 RunCompleted（由 Run 聚合根 complete() 时产生，worker 路径
 *     在 save() 后分发）。由于 worker 已通过 save() 持久化 Run 本身，此处仅做**观测副作用**
 *     （日志 + 未来可扩展的通知/审计），不重复持久化，避免双写。
 *
 * 同步路径（backtest-service）目前不调用 Run.complete()，因此 RunCompleted 主要由 worker 触发。
 * 若同步路径未来也驱动 Run 状态机，可统一由此 handler 处理完成态副作用。
 *
 * 分层：位于 application 层（非 domain 层），因为 BacktestCompletedHandler 直接依赖
 * repositories/backtestRunRepo 完成持久化副作用；domain 层仅保留事件契约与分发器。
 */

import { logger } from '../utils/logger.js';
import { createRun } from '../repositories/backtestRunRepo.js';
import { RUN_COMPLETED_EVENT } from '../domain/events/events.js';
import type { EventHandler, DomainEvent } from '../domain/events/events.js';

/**
 * BacktestCompleted 事件处理器：将回测摘要持久化到 backtest_runs 表。
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

/**
 * RunCompleted 事件处理器：记录观测日志（不重复持久化，避免双写）。
 */
export class RunCompletedHandler implements EventHandler {
  /** 订阅的事件类型 */
  readonly eventType = RUN_COMPLETED_EVENT;

  /**
   * 处理 RunCompleted 事件：记录观测日志。
   *
   * @param event - 领域事件，payload 含 name/portfolioId/ownerUserId
   */
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