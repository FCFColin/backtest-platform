/**
 * 领域事件分发器（Domain Event Dispatcher）
 *
 * ADR-013：DDD 领域事件路由机制
 *
 * 企业为何需要：DDD 中聚合根只负责维护自身一致性，跨聚合的副作用
 * （如回测完成后的审计、通知）应通过领域事件解耦。无事件分发器时，
 * 聚合根需直接调用其他模块，导致领域层依赖基础设施层，违反依赖倒置。
 * 事件分发器作为中介，让聚合根只负责"发布事件"，由分发器路由到
 * 已注册的处理器，实现触发者与执行者的解耦。
 *
 * 权衡：
 * - 事件分发为同步执行（Promise.allSettled），不跨进程。
 *   跨进程异步通信由 Outbox 表 + OutboxPublisher 负责（ADR-005）。
 * - 单个处理器失败不阻塞其他处理器（allSettled 语义），
 *   但失败会被记录到日志，便于排障。
 * - 不保证事件顺序（并发执行），需要顺序保证的场景应在同一处理器内串行处理。
 */

import { logger } from '../../utils/logger.js';

/**
 * 领域事件通用接口
 *
 * 所有领域事件均需实现此接口，包含事件类型、聚合信息与负载。
 * eventType 与现有事件接口的 type 字段保持一致（如 'BacktestCompleted'）。
 */
export interface DomainEvent {
  /** 事件类型，对应聚合根发布的 type 字段（如 'BacktestCompleted'） */
  eventType: string;
  /** 聚合根类型（如 'Portfolio'） */
  aggregateType: string;
  /** 聚合根 ID（如 portfolioId） */
  aggregateId: string;
  /** 事件负载，包含事件特有的业务字段 */
  payload: Record<string, unknown>;
  /** 事件发生时间 */
  occurredAt: Date;
}

/**
 * 事件处理器接口
 *
 * 每个处理器负责处理一种事件类型，通过 eventType 注册到分发器。
 * handle 方法为异步，允许执行数据库写入、外部调用等副作用。
 */
export interface EventHandler {
  /** 处理器订阅的事件类型，需与 DomainEvent.eventType 匹配 */
  eventType: string;
  /** 处理事件，副作用在此执行 */
  handle(event: DomainEvent): Promise<void>;
}

/**
 * 领域事件分发器
 *
 * 维护 eventType → EventHandler[] 的映射，dispatch 时并发调用所有注册处理器。
 * 使用 Promise.allSettled 保证单个处理器失败不影响其他处理器执行。
 */
export class DomainEventDispatcher {
  private handlers = new Map<string, EventHandler[]>();

  /**
   * 注册事件处理器
   *
   * 同一 eventType 可注册多个处理器，按注册顺序调用。
   *
   * @param handler - 事件处理器实例
   */
  register(handler: EventHandler): void {
    const existing = this.handlers.get(handler.eventType) ?? [];
    existing.push(handler);
    this.handlers.set(handler.eventType, existing);
    logger.debug({ eventType: handler.eventType }, 'Event handler registered');
  }

  /**
   * 分发领域事件到所有已注册的处理器
   *
   * 使用 Promise.allSettled 并发执行所有处理器，单个处理器失败
   * 不会中断其他处理器的执行，失败信息记录到日志。
   * 无注册处理器时静默返回（debug 日志），便于新增事件类型时渐进迁移。
   *
   * @param event - 领域事件
   */
  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    if (handlers.length === 0) {
      logger.debug({ eventType: event.eventType }, 'No handlers registered for event');
      return;
    }

    logger.info(
      { eventType: event.eventType, aggregateId: event.aggregateId, handlerCount: handlers.length },
      'Dispatching domain event',
    );

    const errors: Error[] = [];
    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler.handle(event);
        } catch (err) {
          logger.error(
            { err, eventType: event.eventType, handler: handler.constructor.name },
            'Event handler failed',
          );
          errors.push(err as Error);
        }
      }),
    );

    if (errors.length > 0) {
      logger.warn(
        { eventType: event.eventType, errorCount: errors.length },
        'Some event handlers failed',
      );
    }
  }
}

/**
 * 领域事件分发器单例
 *
 * 全局共享一个分发器实例，便于在应用启动时统一注册处理器，
 * 在聚合根中通过 import { eventDispatcher } 发布事件。
 */
export const eventDispatcher = new DomainEventDispatcher();
