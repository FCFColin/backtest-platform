/**
 * Run 聚合根单元测试
 *
 * 覆盖：
 * - create() 初始状态为 queued，产生 RunStarted 事件
 * - 状态机合法路径：queued → running → completed（产生 RunCompleted）
 * - 状态机合法路径：queued → running → failed（产生 RunFailed）
 * - 状态机合法路径：queued → cancelled（产生 RunCancelled）
 * - 终态非法转换：completed/failed/cancelled → start/complete/fail/cancel 抛错
 * - pullEvents() 取出后清空
 */

import { describe, it, expect } from 'vitest';
import { Run } from '../../../packages/backend/src/domain/aggregates/run.js';
import { DomainValidationError } from '../../../packages/backend/src/domain/errors.js';

describe('Run Aggregate', () => {
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

    it('completed → start 抛错（终态不可转换）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.complete({ result: 1 });
      expect(() => run.start()).toThrow(DomainValidationError);
    });
  });

  describe('complete', () => {
    it('running → completed，设置 result + completedAt，产生 RunCompleted', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.pullEvents(); // 清空 RunStarted
      run.start();
      run.complete({ totalReturn: 0.15 });
      expect(run.status).toBe('completed');
      expect(run.result).toEqual({ totalReturn: 0.15 });
      expect(run.completedAt).toBeInstanceOf(Date);
      expect(run.isTerminal).toBe(true);
      const events = run.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('RunCompleted');
    });

    it('queued → complete 抛错（必须先 start）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      expect(() => run.complete({})).toThrow(DomainValidationError);
      expect(() => run.complete({})).toThrow("expected 'running'");
    });

    it('completed → complete 抛错（终态不可转换）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.complete({ a: 1 });
      expect(() => run.complete({ a: 2 })).toThrow(DomainValidationError);
    });
  });

  describe('fail', () => {
    it('running → failed，设置 failureReason + completedAt，产生 RunFailed', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.pullEvents(); // 清空 RunStarted
      run.start();
      run.fail('engine unavailable');
      expect(run.status).toBe('failed');
      expect(run.failureReason).toBe('engine unavailable');
      expect(run.completedAt).toBeInstanceOf(Date);
      expect(run.isTerminal).toBe(true);
      const events = run.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('RunFailed');
      expect(events[0].payload.failureReason).toBe('engine unavailable');
    });

    it('queued → fail 抛错（必须先 start）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      expect(() => run.fail('err')).toThrow(DomainValidationError);
    });

    it('failed → fail 抛错（终态不可重复失败）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.fail('first error');
      expect(() => run.fail('second error')).toThrow(DomainValidationError);
    });
  });

  describe('cancel', () => {
    it('queued → cancelled，设置 completedAt，产生 RunCancelled', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.pullEvents(); // 清空 RunStarted
      run.cancel();
      expect(run.status).toBe('cancelled');
      expect(run.completedAt).toBeInstanceOf(Date);
      expect(run.isTerminal).toBe(true);
      const events = run.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('RunCancelled');
    });

    it('running → cancelled 合法', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.pullEvents(); // 清空 RunStarted
      run.start();
      run.cancel();
      expect(run.status).toBe('cancelled');
    });

    it('completed → cancel 抛错（终态不可转换）', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.complete({});
      expect(() => run.cancel()).toThrow(DomainValidationError);
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

    it('完整生命周期：create→start→complete 产生 RunStarted + RunCompleted', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.complete({ result: 1 });
      const events = run.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual(['RunStarted', 'RunCompleted']);
    });

    it('完整失败生命周期：create→start→fail 产生 RunStarted + RunFailed', () => {
      const run = Run.create({ id: 'r1', request: {} });
      run.start();
      run.fail('timeout');
      const events = run.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual(['RunStarted', 'RunFailed']);
    });
  });
});
