import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

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

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

// db/getPool 仍 mock：用于断言处理器**不再**访问数据库。
const poolMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks),
}));

import { Run } from '../../../packages/backend/src/domain/aggregates/run.js';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker, Weight } from '../../../packages/backend/src/domain/value-objects/index.js';
import { DomainValidationError } from '../../../packages/backend/src/domain/errors.js';
import { DomainEventDispatcher } from '../../../packages/backend/src/domain/events/events.js';
import type {
  DomainEvent,
  EventHandler,
} from '../../../packages/backend/src/domain/events/events.js';
import { BacktestCompletedHandler } from '../../../packages/backend/src/application/completedHandlers.js';

function makeHolding(ticker: string, weight: number) {
  return { ticker: Ticker.create(ticker), weight: Weight.create(weight) };
}

describe('Run Aggregate', () => {
  it.each([
    [
      'complete',
      { totalReturn: 0.15 },
      'completed',
      'RunCompleted',
      true,
      (r: Run) => {
        expect(r.result).toEqual({ totalReturn: 0.15 });
      },
      () => {},
    ],
    [
      'fail',
      'engine unavailable',
      'failed',
      'RunFailed',
      true,
      (r: Run) => {
        expect(r.failureReason).toBe('engine unavailable');
      },
      (e: { payload: Record<string, unknown> }[]) => {
        expect(e[0].payload.failureReason).toBe('engine unavailable');
      },
    ],
    ['cancel', undefined, 'cancelled', 'RunCancelled', false, () => {}, () => {}],
  ])(
    '%s 后进入终态并产生 %s 事件',
    async (_method, arg, status, eventType, fromStart, state, event) => {
      const run = Run.create({ id: 'r1', request: {} });
      run.pullEvents(); // 清空 RunStarted
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
      const run = Run.create({ id: 'r1', request: {} });
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
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      expect(run.status).toBe('running');
      expect(run.startedAt).toBeInstanceOf(Date);
    });
    it('running → start 抛错（不可重复 start）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      expect(() => run.start()).toThrow(DomainValidationError);
      expect(() => run.start()).toThrow("expected 'queued'");
    });
  });

  describe('complete', () => {
    it('queued → complete 抛错（必须先 start）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      expect(() => run.complete({})).toThrow(DomainValidationError);
      expect(() => run.complete({})).toThrow("expected 'running'");
    });
  });

  describe('fail', () => {
    it('queued → fail 抛错（必须先 start）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      expect(() => run.fail('err')).toThrow(DomainValidationError);
    });
  });

  describe('cancel', () => {
    it('running → cancelled 合法', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.pullEvents(); // 清空 RunStarted
      run.start();
      run.cancel();
      expect(run.status).toBe('cancelled');
    });
  });

  describe('终态不可转换', () => {
    it.each([
      ['start', (r: Run) => r.start()],
      ['complete', (r: Run) => r.complete({})],
      ['cancel', (r: Run) => r.cancel()],
    ])('completed → %s 抛错（终态不可转换）', (_op, invoke) => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.complete({});
      expect(() => invoke(run)).toThrow(DomainValidationError);
    });
    it('failed → fail 抛错（终态不可重复失败）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.fail('first error');
      expect(() => run.fail('second error')).toThrow(DomainValidationError);
    });
  });

  describe('pullEvents', () => {
    it('取出后清空，再次调用返回空数组', () => {
      const run = Run.create({ id: 'r1', request: {} });
      const first = run.pullEvents();
      expect(first).toHaveLength(1);
      const second = run.pullEvents();
      expect(second).toHaveLength(0);
    });
    it.each([
      ['complete', 'RunCompleted'],
      ['fail', 'RunFailed'],
    ])('完整生命周期：create→start→%s 产生 RunStarted + %s', (method, eventType) => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      (run as unknown as Record<string, (a: unknown) => void>)[method](
        method === 'complete' ? { result: 1 } : 'timeout',
      );
      const events = run.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual(['RunStarted', eventType]);
    });
  });
});

describe('Portfolio Aggregate', () => {
  describe('create', () => {
    it('权重和为 100 时创建成功', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
      expect(p.holdingCount).toBe(2);
    });
    it('权重和偏差超过容差时抛出错误', () => {
      expect(() => Portfolio.create('p1', 'Test', [makeHolding('AAPL', 50)])).toThrow(
        'weights must sum to ~100',
      );
    });
  });

  describe('properties', () => {
    const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
    it('holdingCount 返回持仓数量', () => {
      expect(p.holdingCount).toBe(2);
    });
    it('tickers 返回所有 ticker 值列表', () => {
      expect(p.tickers).toEqual(['AAPL', 'SPY']);
    });
    it('totalWeight 返回权重总和', () => {
      expect(p.totalWeight).toBe(100);
    });
    it('maxWeight 返回最大持仓权重', () => {
      expect(p.maxWeight).toBe(60);
    });
  });
});

describe('Weight.create', () => {
  it.each([
    [0, '下边界 0%'],
    [100, '上边界 100%'],
    [50, '一半'],
    [25, '四分之一'],
  ])('应接受 %s（%s）', (value) => {
    const weight = Weight.create(value);
    expect(weight.value).toBe(value);
  });

  it('应拒绝负数', () => {
    expect(() => Weight.create(-1)).toThrow(/between 0 and 100/);
  });

  it('应拒绝大于 100', () => {
    expect(() => Weight.create(101)).toThrow(/between 0 and 100/);
  });
});

describe('Ticker.create', () => {
  describe('合法 ticker', () => {
    it.each([
      ['AAPL', 'AAPL', '美股代码'],
      ['MSFT', 'MSFT', '美股代码'],
      ['VTI', 'VTI', 'ETF 代码'],
      ['A', 'A', '单字符'],
      ['ABCDE', 'ABCDE', '5 字符'],
      ['ABCDEFGHIJ', 'ABCDEFGHIJ', '10 字符（上限）'],
      ['123', '123', '数字代码'],
      ['A1B2', 'A1B2', '字母数字混合'],
      ['510300.SS', '510300.SS', 'A 股带后缀'],
      ['600519.SH', '600519.SH', '沪市后缀'],
      ['000001.SZ', '000001.SZ', '深市后缀'],
    ])('应接受 %s（%s）', (input, expected) => {
      const ticker = Ticker.create(input);
      expect(ticker.value).toBe(expected);
    });

    it('应将小写转为大写（大小写归一化）', () => {
      const ticker = Ticker.create('aapl');
      expect(ticker.value).toBe('AAPL');
    });

    it('应去除首尾空格', () => {
      const ticker = Ticker.create('  AAPL  ');
      expect(ticker.value).toBe('AAPL');
    });

    it('小写带后缀应转为大写带后缀', () => {
      const ticker = Ticker.create('510300.ss');
      expect(ticker.value).toBe('510300.SS');
    });
  });

  describe('非法 ticker', () => {
    it.each([
      ['AAPL!', '感叹号'],
      ['AAPL@', 'at 符号'],
      ['AAPL#', '井号'],
      ['AA PL', '中间空格'],
      ['中证500', '非 ASCII 字符'],
      ['AAPL.BCD', '后缀超过 2 字符'],
      ['AAPL.', '后缀为空'],
      ['.SS', '主体为空'],
      ['AAPL-SZ', '连字符非法'],
      ['AAPL_SS', '下划线非法'],
    ])('应拒绝 %s（%s）', (input) => {
      expect(() => Ticker.create(input)).toThrow(/Invalid ticker/);
    });

    it('应拒绝超过 10 字符的 ticker（不含后缀）', () => {
      expect(() => Ticker.create('ABCDEFGHIJK')).toThrow(/Invalid ticker/);
    });

    it('应拒绝空字符串', () => {
      expect(() => Ticker.create('')).toThrow(/Invalid ticker/);
    });

    it('应拒绝仅含空格的字符串（trim 后为空）', () => {
      expect(() => Ticker.create('   ')).toThrow(/Invalid ticker/);
    });

    // 注：'AAPL ' 和 ' AAPL' 在 trim 后变为 'AAPL'，是合法的
    // 这是 Ticker.create 的归一化行为（先 trim 再校验）
    it('尾随空格应在 trim 后通过校验（归一化行为）', () => {
      const ticker = Ticker.create('AAPL ');
      expect(ticker.value).toBe('AAPL');
    });

    it('前导空格应在 trim 后通过校验（归一化行为）', () => {
      const ticker = Ticker.create(' AAPL');
      expect(ticker.value).toBe('AAPL');
    });
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

describe('Ticker 不变性', () => {
  it('value 属性应通过 readonly 修饰符保护（编译时检查）', () => {
    const ticker = Ticker.create('AAPL');
    expect(ticker.value).toBe('AAPL');
    // 注：TypeScript 的 readonly 是编译时约束，运行时不强制。
    // 此处仅验证 value 属性存在且可读，不可变性由 TS 编译器保证。
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
    const event = createEvent('UnregisteredEvent');

    // 不应抛出异常
    await expect(dispatcher.dispatch(event)).resolves.toBeUndefined();
    // 应记录 info 日志（便于排障，但不报错）
    expect(loggerMocks.info).toHaveBeenCalledWith(
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

function makeEvent(payload: Record<string, unknown> = {}): DomainEvent {
  return {
    eventType: 'BacktestCompleted',
    aggregateType: 'Portfolio',
    aggregateId: 'portfolio-1',
    payload: {
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
    poolMocks.query.mockResolvedValue(undefined);
  });

  it('应订阅 BacktestCompleted 事件类型', () => {
    expect(handler.eventType).toBe('BacktestCompleted');
  });

  it('handle 应记录 info 日志（含关键指标）', async () => {
    const event = makeEvent();
    await handler.handle(event);

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

  it('handle 不应访问数据库（不写 outbox、不发 NOTIFY）', async () => {
    const event = makeEvent();
    await handler.handle(event);

    // ADR-024：处理器为纯观测副作用，不得调用 pool.query。
    expect(poolMocks.query).not.toHaveBeenCalled();
  });

  it('handle 不应抛出错误', async () => {
    const event = makeEvent();
    await expect(handler.handle(event)).resolves.toBeUndefined();
  });

  it('payload 缺少指标字段时也应正常处理', async () => {
    const event = makeEvent({});
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
