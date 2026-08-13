import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker, Weight } from '../../../packages/backend/src/domain/value-objects/index.js';
import { DomainEventDispatcher } from '../../../packages/backend/src/domain/events/events.js';
import type {
  DomainEvent,
  EventHandler,
} from '../../../packages/backend/src/domain/events/events.js';

function makeHolding(ticker: string, weight: number) {
  return { ticker: Ticker.create(ticker), weight: Weight.create(weight) };
}

describe('Portfolio Aggregate', () => {
  it('权重和为 100 时创建成功', () => {
    const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
    expect(p.holdingCount).toBe(2);
  });
  it('权重和偏差超过容差时抛出错误', () => {
    expect(() => Portfolio.create('p1', 'Test', [makeHolding('AAPL', 50)])).toThrow(
      'weights must sum to ~100',
    );
  });
  it('重复 ticker 应抛出错误（持仓权重歧义）', () => {
    expect(() =>
      Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('AAPL', 40)]),
    ).toThrow('duplicate ticker: AAPL');
  });
  describe('properties', () => {
    const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
    it.each([
      ['tickers 返回所有 ticker 值列表', (x: Portfolio) => x.tickers, ['AAPL', 'SPY']],
      ['totalWeight 返回权重总和', (x: Portfolio) => x.totalWeight, 100],
      ['maxWeight 返回最大持仓权重', (x: Portfolio) => x.maxWeight, 60],
    ])('%s', (_n, getter, expected) => {
      expect(getter(p)).toEqual(expected);
    });
  });
});

describe('Weight.create', () => {
  it.each([
    [0, '下边界 0%'],
    [100, '上边界 100%'],
    [50, '一半'],
  ])('应接受 %s（%s）', (value) => {
    expect(Weight.create(value).value).toBe(value);
  });
  it.each([
    [-1, '负数'],
    [101, '大于 100'],
  ])('应拒绝%s（%s）', (value) => {
    expect(() => Weight.create(value)).toThrow(/between 0 and 100/);
  });
});

describe('Ticker.create', () => {
  it.each([
    ['AAPL', 'AAPL', '美股代码'],
    ['VTI', 'VTI', 'ETF 代码'],
    ['A', 'A', '单字符'],
    ['ABCDE', 'ABCDE', '5 字符'],
    ['ABCDEFGHIJ', 'ABCDEFGHIJ', '10 字符（上限）'],
    ['123', '123', '数字代码'],
    ['A1B2', 'A1B2', '字母数字混合'],
    ['510300.SS', '510300.SS', 'A 股带后缀'],
    ['aapl', 'AAPL', '小写转大写（归一化）'],
    ['  AAPL  ', 'AAPL', '去除首尾空格'],
    ['510300.ss', '510300.SS', '小写带后缀'],
  ])('应接受 %s（%s）', (input, expected) => {
    expect(Ticker.create(input).value).toBe(expected);
  });
  it.each([
    ['AAPL!', '感叹号'],
    ['AA PL', '中间空格'],
    ['中证500', '非 ASCII 字符'],
    ['AAPL.BCD', '后缀超过 2 字符'],
    ['AAPL.', '后缀为空'],
    ['.SS', '主体为空'],
    ['AAPL-SZ', '连字符非法'],
    ['ABCDEFGHIJK', '超过 10 字符（不含后缀）'],
    ['', '空字符串'],
    ['   ', '仅含空格（trim 后为空）'],
  ])('应拒绝 %s（%s）', (input) => {
    expect(() => Ticker.create(input)).toThrow(/Invalid ticker/);
  });
});

describe('Ticker.toString', () => {
  it.each([
    ['应返回 value 字符串', 'AAPL', 'AAPL'],
    ['带后缀的 ticker 应返回完整字符串', '510300.SS', '510300.SS'],
    ['小写输入应返回大写字符串', 'msft', 'MSFT'],
  ])('%s', (_n, input, expected) => {
    expect(Ticker.create(input).toString()).toBe(expected);
  });
});

function createEvent(eventType: string, aggregateId = 'portfolio-1'): DomainEvent {
  return {
    eventType,
    aggregateType: 'Portfolio',
    aggregateId,
    payload: { foo: 'bar' },
    occurredAt: new Date('2026-01-01T00:00:00Z'),
  };
}
function createHandler(eventType: string, fail = false): EventHandler {
  return {
    eventType,
    handle: vi.fn(async () => {
      if (fail) throw new Error('handler failure');
    }),
  };
}

describe('DomainEventDispatcher', () => {
  let dispatcher: DomainEventDispatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new DomainEventDispatcher();
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
    await expect(dispatcher.dispatch(createEvent('UnregisteredEvent'))).resolves.toBeUndefined();
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'UnregisteredEvent' }),
      'No handlers registered for event',
    );
  });
  it('dispatch() 单个处理器失败时不应阻塞其他处理器，但应向上传播错误', async () => {
    const failingHandler = createHandler('TestEvent', true);
    const successHandler = createHandler('TestEvent');
    dispatcher.register(failingHandler);
    dispatcher.register(successHandler);
    await expect(dispatcher.dispatch(createEvent('TestEvent'))).rejects.toThrow(
      'Event dispatch failed for TestEvent',
    );
    expect(failingHandler.handle).toHaveBeenCalledTimes(1);
    expect(successHandler.handle).toHaveBeenCalledTimes(1);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TestEvent' }),
      'Event handler failed',
    );
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TestEvent', errorCount: 1 }),
      'Some event handlers failed',
    );
  });
  it.each([
    ['同一事件类型的多个处理器均应被调用', 3, null],
    [
      'register 同一事件类型多次注册应累积处理器',
      2,
      expect.objectContaining({ eventType: 'MultiEvent', handlerCount: 2 }),
    ],
  ])('%s', async (_n, count, logExpect) => {
    const handlers = Array.from({ length: count }, () => createHandler('MultiEvent'));
    handlers.forEach((h) => dispatcher.register(h));
    const event = createEvent('MultiEvent');
    await dispatcher.dispatch(event);
    for (const h of handlers) {
      expect(h.handle).toHaveBeenCalledTimes(1);
      expect(h.handle).toHaveBeenCalledWith(event);
    }
    if (logExpect)
      expect(loggerMocks.info).toHaveBeenCalledWith(logExpect, 'Dispatching domain event');
  });
  it('dispatch() 应只调用对应事件类型的处理器，不调用其他类型', async () => {
    const targetHandler = createHandler('TargetEvent');
    const otherHandler = createHandler('OtherEvent');
    dispatcher.register(targetHandler);
    dispatcher.register(otherHandler);
    await dispatcher.dispatch(createEvent('TargetEvent'));
    expect(targetHandler.handle).toHaveBeenCalledTimes(1);
    expect(otherHandler.handle).not.toHaveBeenCalled();
  });
  it('dispatch() 所有处理器均失败时应记录警告并向上抛出 AggregateError', async () => {
    dispatcher.register(createHandler('AllFailEvent', true));
    dispatcher.register(createHandler('AllFailEvent', true));
    await expect(dispatcher.dispatch(createEvent('AllFailEvent'))).rejects.toThrow(
      'Event dispatch failed for AllFailEvent',
    );
    expect(loggerMocks.error).toHaveBeenCalledTimes(2);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AllFailEvent', errorCount: 2 }),
      'Some event handlers failed',
    );
  });
});
