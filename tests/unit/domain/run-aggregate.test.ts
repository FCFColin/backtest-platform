import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

vi.mock('../../../packages/backend/src/repositories/backtestRunRepo.js', () => ({
  createRun: vi.fn(),
}));
import { Run } from '../../../packages/backend/src/domain/aggregates/run.js';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import {
  DomainValidationError,
  Ticker,
  Weight,
} from '../../../packages/backend/src/domain/value-objects/index.js';
import { DomainEventDispatcher } from '../../../packages/backend/src/domain/events/events.js';
import type {
  DomainEvent,
  EventHandler,
} from '../../../packages/backend/src/domain/events/events.js';
import { BacktestCompletedHandler } from '../../../packages/backend/src/application/completedHandlers.js';
import * as repoModule from '../../../packages/backend/src/repositories/backtestRunRepo.js';

function makeHolding(ticker: string, weight: number) {
  return { ticker: Ticker.create(ticker), weight: Weight.create(weight) };
}

function createRun() {
  return Run.create({ id: 'r1', request: {} });
}
function startedRun() {
  const run = createRun();
  run.start();
  return run;
}

describe('Run Aggregate', () => {
  it.each([
    [
      'complete',
      { totalReturn: 0.15 },
      'completed',
      'RunCompleted',
      true,
      (r: Run) => expect(r.result).toEqual({ totalReturn: 0.15 }),
      () => {},
    ],
    [
      'fail',
      'engine unavailable',
      'failed',
      'RunFailed',
      true,
      (r: Run) => expect(r.failureReason).toBe('engine unavailable'),
      (e: { payload: Record<string, unknown> }[]) =>
        expect(e[0].payload.failureReason).toBe('engine unavailable'),
    ],
  ])(
    '%s 后进入终态并产生 %s 事件',
    async (_method, arg, status, eventType, fromStart, state, event) => {
      const run = createRun();
      run.pullEvents();
      if (fromStart) run.start();
      (run as unknown as Record<string, (a: unknown) => void>)[_method](arg);
      expect(run.status).toBe(status);
      expect(run.completedAt).toBeInstanceOf(Date);
      expect(run.isTerminal).toBe(true);
      state(run);
      const events = run.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe(eventType);
      event(events);
    },
  );

  describe('create', () => {
    it('初始状态为 queued', () => {
      const run = Run.create({ id: 'r1', request: { foo: 'bar' } });
      expect(run.status).toBe('queued');
      expect(run.id).toBe('r1');
      expect(run.request).toEqual({ foo: 'bar' });
      expect(run.result).toBeNull();
      expect(run.startedAt).toBeUndefined();
      expect(run.completedAt).toBeUndefined();
      expect(run.isTerminal).toBe(false);
    });
    it('create 时产生 RunStarted 事件', () => {
      const run = createRun();
      const events = run.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('RunStarted');
      expect(events[0].aggregateType).toBe('Run');
      expect(events[0].aggregateId).toBe('r1');
      expect(events[0].occurredAt).toBeInstanceOf(Date);
    });
    it('skipInitialEvent=true 时不产生事件（fromRow 场景）', () => {
      const run = Run.fromRow({
        id: 'r1',
        request: {},
        status: 'completed',
        skipInitialEvent: true,
      });
      expect(run.pullEvents()).toHaveLength(0);
      expect(run.status).toBe('completed');
    });
    it('携带 portfolioId/name/ownerUserId 属性', () => {
      const run = Run.create({
        id: 'r1',
        portfolioId: 'p1',
        name: 'Test Run',
        request: {},
        ownerUserId: 'u1',
      });
      expect(run.portfolioId).toBe('p1');
      expect(run.name).toBe('Test Run');
      expect(run.ownerUserId).toBe('u1');
    });
  });

  describe('start', () => {
    it('queued → running，设置 startedAt', () => {
      const run = startedRun();
      expect(run.status).toBe('running');
      expect(run.startedAt).toBeInstanceOf(Date);
    });
    it('running → start 抛错（不可重复 start）', () => {
      const run = startedRun();
      expect(() => run.start()).toThrow(DomainValidationError);
      expect(() => run.start()).toThrow("expected 'queued'");
    });
  });

  it.each([
    ['complete', (r: Run) => r.complete({}), "expected 'running'"],
    ['fail', (r: Run) => r.fail('err'), null],
  ])('queued → %s 抛错（必须先 start）', (_op, invoke, msg) => {
    const run = createRun();
    expect(() => invoke(run)).toThrow(DomainValidationError);
    if (msg) expect(() => invoke(run)).toThrow(msg);
  });

  it('running → completed 合法', () => {
    const run = startedRun();
    run.pullEvents();
    run.complete({});
    expect(run.status).toBe('completed');
  });

  it.each([
    ['start', (r: Run) => r.start()],
    ['complete', (r: Run) => r.complete({})],
  ])('completed → %s 抛错（终态不可转换）', (_op, invoke) => {
    const run = startedRun();
    run.complete({});
    expect(() => invoke(run)).toThrow(DomainValidationError);
  });
  it('failed → fail 抛错（终态不可重复失败）', () => {
    const run = startedRun();
    run.fail('first error');
    expect(() => run.fail('second error')).toThrow(DomainValidationError);
  });

  it('pullEvents 取出后清空，再次调用返回空数组', () => {
    const run = createRun();
    expect(run.pullEvents()).toHaveLength(1);
    expect(run.pullEvents()).toHaveLength(0);
  });
  it.each([
    ['complete', 'RunCompleted'],
    ['fail', 'RunFailed'],
  ])('完整生命周期：create→start→%s 产生 RunStarted + %s', (method, eventType) => {
    const run = startedRun();
    (run as unknown as Record<string, (a: unknown) => void>)[method](
      method === 'complete' ? { result: 1 } : 'timeout',
    );
    expect(run.pullEvents().map((e) => e.eventType)).toEqual(['RunStarted', eventType]);
  });
});

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

function makeEvent(payload: Record<string, unknown> = {}): DomainEvent {
  return {
    eventType: 'BacktestCompleted',
    aggregateType: 'Portfolio',
    aggregateId: 'portfolio-1',
    payload: {
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
      totalReturn: 0.15,
      maxDrawdown: -0.2,
      sharpeRatio: 1.2,
      ...payload,
    },
    occurredAt: new Date('2024-06-15T00:00:00Z'),
  };
}

describe('BacktestCompletedHandler', () => {
  let handler: BacktestCompletedHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new BacktestCompletedHandler();
    (repoModule.createRun as Mock).mockResolvedValue({ id: 'run-1' });
  });

  it('应订阅 BacktestCompleted 事件类型', () => {
    expect(handler.eventType).toBe('BacktestCompleted');
  });
  it('handle 应记录 info 日志（含关键指标）', async () => {
    await handler.handle(makeEvent());
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BacktestCompleted',
        aggregateId: 'portfolio-1',
        totalReturn: 0.15,
        maxDrawdown: -0.2,
        sharpeRatio: 1.2,
      }),
      expect.stringContaining('回测完成事件已接收'),
    );
  });
  it('handle 应通过 createRun 持久化摘要，且不访问 outbox/NOTIFY', async () => {
    await handler.handle(makeEvent());
    expect(repoModule.createRun).toHaveBeenCalledTimes(1);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateId: 'portfolio-1' }),
      expect.stringContaining('已持久化'),
    );
  });
  it('createRun 失败时向上抛错（ADR-014 不吞错）', async () => {
    (repoModule.createRun as Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(handler.handle(makeEvent())).rejects.toThrow('db down');
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateId: 'portfolio-1' }),
      expect.stringContaining('持久化回测运行摘要失败'),
    );
  });
  it('payload 缺少指标字段时也应正常处理', async () => {
    const event = makeEvent();
    (event as Record<string, unknown>).payload = {};
    await handler.handle(event);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        totalReturn: undefined,
        maxDrawdown: undefined,
        sharpeRatio: undefined,
      }),
      expect.stringContaining('回测完成事件已接收'),
    );
  });
});
