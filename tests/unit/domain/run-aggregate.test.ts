import { describe, it, expect } from 'vitest';
import { Run } from '../../../packages/backend/src/domain/aggregates/run.js';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker, Weight } from '../../../packages/backend/src/domain/value-objects/index.js';
import { DomainValidationError } from '../../../packages/backend/src/domain/errors.js';

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
