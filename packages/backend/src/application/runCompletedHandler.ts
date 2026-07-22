/**
 * RunCompleted 事件处理器（ADR-013 Phase 3）
 *
 * 与 BacktestCompletedHandler 的关键区别：
 *   - BacktestCompletedHandler：监听 BacktestCompleted（由 backtest-service 在引擎返回后分发），
 *     负责将回测摘要**首次持久化**到 backtest_runs 表
 *   - RunCompletedHandler：监听 RunCompleted（由 Run 聚合根 complete() 时产生，worker 路径
 *     在 save() 后分发）。由于 worker 已通过 save() 持久化 Run 本身，此处仅做**观测副作用**
 *     （日志 + 未来可扩展的通知/审计），不重复持久化，避免双写。
 *
 * 同步路径（backtest-service）目前不调用 Run.complete()，因此 RunCompleted 主要由 worker 触发。
 * 若同步路径未来也驱动 Run 状态机，可统一由此 handler 处理完成态副作用。
 */

import { logger } from '../utils/logger.js';
import { RUN_COMPLETED_EVENT } from '../domain/events/runEvents.js';
import type { EventHandler, DomainEvent } from '../domain/events/EventDispatcher.js';

/**
 * RunCompleted 事件处理器。
 *
 * 订阅 'RunCompleted' 事件，记录日志（含 aggregateId + ownerUserId）。
 * 不访问数据库——Run 聚合根已由 worker 的 save() 持久化，此处再写会造成双写。
 * 失败仅记录错误日志，不影响主流程（allSettled 语义）。
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
