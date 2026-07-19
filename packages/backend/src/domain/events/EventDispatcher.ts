import { logger } from '../../utils/logger.js';

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
