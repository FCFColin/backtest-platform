import { logger } from '../../utils/logger.js';

// DDD: Run 领域事件契约（ADR-013 Phase 3 Domain Event）
//
// Run 聚合根在状态转换时产生以下事件：
//   - RunStarted:    create() 时产生
//   - RunCompleted: running → completed 时产生
//   - RunFailed:    running → failed 时产生
//   - RunCancelled: queued|running → cancelled 时产生
//
// 事件 payload 由聚合根构造（domain/aggregates/run.ts），此文件仅导出事件类型常量
// 供 EventHandler 订阅时引用，避免散落的字符串字面量。
//
// 设计取舍：未为每个事件定义独立 interface/class，因为事件 payload 已在聚合根内部
// 内联构造，重复定义 interface 会造成双重维护。常量 + DomainEvent 接口足够类型安全。

/** Run 聚合根事件类型常量 */
export const RUN_STARTED_EVENT = 'RunStarted' as const;
export const RUN_COMPLETED_EVENT = 'RunCompleted' as const;
export const RUN_FAILED_EVENT = 'RunFailed' as const;
export const RUN_CANCELLED_EVENT = 'RunCancelled' as const;

/** Run 聚合根类型（用于事件 aggregateType 字段） */
export const RUN_AGGREGATE_TYPE = 'Run' as const;

/** 所有 Run 事件类型字面量联合，用于 EventHandler eventType 类型约束 */
export type RunEventType =
  | typeof RUN_STARTED_EVENT
  | typeof RUN_COMPLETED_EVENT
  | typeof RUN_FAILED_EVENT
  | typeof RUN_CANCELLED_EVENT;

export interface DomainEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface EventHandler {
  eventType: string;
  handle(event: DomainEvent): Promise<void>;
}

/**
 * 领域事件分发器。维护 eventType → handler[] 映射，
 * dispatch 时并发调用所有处理器（allSettled 语义，单个失败不阻塞其他）。
 */
export class DomainEventDispatcher {
  private handlers = new Map<string, EventHandler[]>();

  register(handler: EventHandler): void {
    const existing = this.handlers.get(handler.eventType) ?? [];
    existing.push(handler);
    this.handlers.set(handler.eventType, existing);
    logger.info({ eventType: handler.eventType }, 'Event handler registered');
  }

  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    if (handlers.length === 0) {
      logger.info({ eventType: event.eventType }, 'No handlers registered for event');
      return;
    }

    logger.info(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        handlerCount: handlers.length,
      },
      'Dispatching domain event',
    );

    const errors: Error[] = [];
    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler.handle(event);
        } catch (err) {
          logger.error(
            {
              err,
              eventType: event.eventType,
              handler: handler.constructor.name,
            },
            'Event handler failed',
          );
          errors.push(err as Error);
        }
      }),
    );

    if (errors.length > 0) {
      logger.warn(
        {
          eventType: event.eventType,
          errorCount: errors.length,
        },
        'Some event handlers failed',
      );
    }
  }
}

export const eventDispatcher = new DomainEventDispatcher();
