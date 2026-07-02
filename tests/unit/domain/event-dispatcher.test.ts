/**
 * DomainEventDispatcher 单元测试（ADR-013 Task 8.5）
 *
 * 企业理由：领域事件分发器是 DDD 解耦的核心基础设施，测试覆盖：
 * - 注册处理器后能正确分发
 * - 无处理器时不抛错（渐进迁移兼容）
 * - 单个处理器失败不阻塞其他处理器（allSettled 隔离性）
 * - 同一事件类型的多个处理器均被调用
 *
 * 权衡：仅测试分发器自身行为，处理器内部逻辑（outbox 写入等）
 * 由各自处理器的测试覆盖，避免重复 mock。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

// 使用 vi.hoisted 保证 mock 在 import 之前生效
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

import { DomainEventDispatcher } from '../../../api/domain/events/EventDispatcher.js';
import type { DomainEvent, EventHandler } from '../../../api/domain/events/EventDispatcher.js';

/** 构造测试用领域事件 */
function createEvent(eventType: string, aggregateId = 'portfolio-1'): DomainEvent {
  return {
    eventType,
    aggregateType: 'Portfolio',
    aggregateId,
    payload: { foo: 'bar' },
    occurredAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** 构造测试用事件处理器 */
function createHandler(eventType: string, handleFn?: (event: DomainEvent) => void): EventHandler {
  return {
    eventType,
    handle: vi.fn(async (event: DomainEvent) => {
      handleFn?.(event);
    }),
  };
}

describe('DomainEventDispatcher', () => {
  let dispatcher: DomainEventDispatcher;

  beforeEach(() => {
    // 每个用例使用独立的 dispatcher，避免处理器跨用例污染
    dispatcher = new DomainEventDispatcher();
    vi.clearAllMocks();
  });

  it('register() 应添加处理器，使 dispatch 能调用到它', async () => {
    const handler = createHandler('TestEvent');
    dispatcher.register(handler);

    const event = createEvent('TestEvent');
    await dispatcher.dispatch(event);

    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(handler.handle).toHaveBeenCalledWith(event);
  });

  it('dispatch() 无注册处理器时应正常返回，不抛错', async () => {
    const event = createEvent('UnregisteredEvent');

    // 不应抛出异常
    await expect(dispatcher.dispatch(event)).resolves.toBeUndefined();
    // 应记录 debug 日志（便于排障，但不报错）
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'UnregisteredEvent' }),
      'No handlers registered for event',
    );
  });

  it('dispatch() 单个处理器失败时不应阻塞其他处理器', async () => {
    const failingHandler: EventHandler = {
      eventType: 'TestEvent',
      handle: vi.fn(async () => {
        throw new Error('handler failure');
      }),
    };
    const successHandler = createHandler('TestEvent');

    dispatcher.register(failingHandler);
    dispatcher.register(successHandler);

    const event = createEvent('TestEvent');
    await dispatcher.dispatch(event);

    // 失败的处理器应被调用
    expect(failingHandler.handle).toHaveBeenCalledTimes(1);
    // 成功的处理器也应被调用（allSettled 隔离性）
    expect(successHandler.handle).toHaveBeenCalledTimes(1);
    // 应记录错误日志
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TestEvent' }),
      'Event handler failed',
    );
    // 应记录警告日志（部分处理器失败）
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TestEvent', errorCount: 1 }),
      'Some event handlers failed',
    );
  });

  it('dispatch() 同一事件类型的多个处理器均应被调用', async () => {
    const handler1 = createHandler('MultiEvent');
    const handler2 = createHandler('MultiEvent');
    const handler3 = createHandler('MultiEvent');

    dispatcher.register(handler1);
    dispatcher.register(handler2);
    dispatcher.register(handler3);

    const event = createEvent('MultiEvent');
    await dispatcher.dispatch(event);

    expect(handler1.handle).toHaveBeenCalledTimes(1);
    expect(handler2.handle).toHaveBeenCalledTimes(1);
    expect(handler3.handle).toHaveBeenCalledTimes(1);
    // 所有处理器都应收到同一个事件对象
    expect(handler1.handle).toHaveBeenCalledWith(event);
    expect(handler2.handle).toHaveBeenCalledWith(event);
    expect(handler3.handle).toHaveBeenCalledWith(event);
  });

  it('dispatch() 应只调用对应事件类型的处理器，不调用其他类型', async () => {
    const targetHandler = createHandler('TargetEvent');
    const otherHandler = createHandler('OtherEvent');

    dispatcher.register(targetHandler);
    dispatcher.register(otherHandler);

    const event = createEvent('TargetEvent');
    await dispatcher.dispatch(event);

    expect(targetHandler.handle).toHaveBeenCalledTimes(1);
    expect(otherHandler.handle).not.toHaveBeenCalled();
  });

  it('register() 同一事件类型多次注册应累积处理器', async () => {
    const handler1 = createHandler('AccumEvent');
    const handler2 = createHandler('AccumEvent');

    dispatcher.register(handler1);
    dispatcher.register(handler2);

    const event = createEvent('AccumEvent');
    await dispatcher.dispatch(event);

    // 两次注册的处理器都应被调用
    expect(handler1.handle).toHaveBeenCalledTimes(1);
    expect(handler2.handle).toHaveBeenCalledTimes(1);
    // 应记录 handlerCount=2
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AccumEvent', handlerCount: 2 }),
      'Dispatching domain event',
    );
  });

  it('dispatch() 所有处理器均失败时应记录警告且不抛错', async () => {
    const failingHandler1: EventHandler = {
      eventType: 'AllFailEvent',
      handle: vi.fn(async () => {
        throw new Error('failure 1');
      }),
    };
    const failingHandler2: EventHandler = {
      eventType: 'AllFailEvent',
      handle: vi.fn(async () => {
        throw new Error('failure 2');
      }),
    };

    dispatcher.register(failingHandler1);
    dispatcher.register(failingHandler2);

    const event = createEvent('AllFailEvent');
    // 不应抛出异常（allSettled 吞掉错误）
    await expect(dispatcher.dispatch(event)).resolves.toBeUndefined();
    // 应记录 2 个错误
    expect(loggerMocks.error).toHaveBeenCalledTimes(2);
    // 应记录警告（errorCount=2）
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AllFailEvent', errorCount: 2 }),
      'Some event handlers failed',
    );
  });
});
