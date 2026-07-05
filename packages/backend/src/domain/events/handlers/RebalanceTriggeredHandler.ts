/**
 * RebalanceTriggered 事件处理器
 *
 * ADR-013：领域事件处理器实现
 *
 * 企业为何需要：再平衡触发是组合管理的核心事件，需记录触发原因与
 * 当前权重快照，便于事后审计与策略回溯。通过事件处理器将日志记录
 * 从再平衡逻辑中解耦，再平衡逻辑只负责发布事件。
 *
 * 权衡：当前实现仅记录日志（再平衡执行由专门的 RebalanceService
 * 同步处理），不写 outbox。未来如需异步触发再平衡，可在此处理器中
 * 追加 outbox 写入，无需修改再平衡逻辑。
 */

import { logger } from '../../../utils/logger.js';
import type { EventHandler, DomainEvent } from '../EventDispatcher.js';

/**
 * RebalanceTriggered 事件处理器
 *
 * 订阅 'RebalanceTriggered' 事件，记录再平衡触发的结构化日志，
 * 包含触发原因与当前权重快照，便于审计与策略回溯。
 */
export class RebalanceTriggeredHandler implements EventHandler {
  /** 订阅的事件类型，与 RebalanceTriggered 接口的 type 字段一致 */
  readonly eventType = 'RebalanceTriggered';

  /**
   * 处理 RebalanceTriggered 事件
   *
   * 记录结构化日志，包含触发原因（reason）与当前权重快照（currentWeights）。
   *
   * @param event - 领域事件，payload 包含 reason/currentWeights
   */
  async handle(event: DomainEvent): Promise<void> {
    logger.info(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        reason: event.payload.reason,
        currentWeights: event.payload.currentWeights,
      },
      '[RebalanceTriggeredHandler] 再平衡触发事件已接收',
    );
  }
}
