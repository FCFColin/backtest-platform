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
      // 向上传播失败，使 outbox 消费端不误标 processed_at（补偿扫描会重试）
      throw new AggregateError(errors, `Event dispatch failed for ${event.eventType}`);
    }
  }
}

export const eventDispatcher = new DomainEventDispatcher();
