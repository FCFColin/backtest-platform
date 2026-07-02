/**
 * RebalanceTriggeredHandler 单元测试
 *
 * 企业理由：再平衡触发事件处理器负责记录再平衡触发的结构化日志，
 * 包含触发原因与当前权重快照。测试覆盖：
 * - 正确订阅 RebalanceTriggered 事件类型
 * - handle 正确记录日志（含 reason/currentWeights）
 * - 不同 payload 字段值正确传递
 *
 * 权衡：mock logger，不验证真实日志输出格式。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted =====
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

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

import { RebalanceTriggeredHandler } from '../../../api/domain/events/handlers/RebalanceTriggeredHandler.js';
import type { DomainEvent } from '../../../api/domain/events/EventDispatcher.js';

function makeEvent(payload: Record<string, unknown> = {}): DomainEvent {
  return {
    eventType: 'RebalanceTriggered',
    aggregateType: 'Portfolio',
    aggregateId: 'portfolio-1',
    payload: {
      reason: 'threshold_exceeded',
      currentWeights: { AAPL: 0.65, BND: 0.35 },
      ...payload,
    },
    occurredAt: new Date('2024-06-15T00:00:00Z'),
  };
}

describe('RebalanceTriggeredHandler', () => {
  let handler: RebalanceTriggeredHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new RebalanceTriggeredHandler();
  });

  it('应订阅 RebalanceTriggered 事件类型', () => {
    expect(handler.eventType).toBe('RebalanceTriggered');
  });

  it('handle 应记录 info 日志（含触发原因和权重快照）', async () => {
    const event = makeEvent();
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'RebalanceTriggered',
        aggregateId: 'portfolio-1',
        reason: 'threshold_exceeded',
        currentWeights: { AAPL: 0.65, BND: 0.35 },
      }),
      expect.stringContaining('再平衡触发事件已接收'),
    );
  });

  it('handle 不应抛出错误（无副作用，仅记录日志）', async () => {
    const event = makeEvent();
    await expect(handler.handle(event)).resolves.toBeUndefined();
  });

  it('不同 reason 应正确传递到日志', async () => {
    const event = makeEvent({ reason: 'scheduled_rebalance' });
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'scheduled_rebalance',
      }),
      expect.any(String),
    );
  });

  it('不同 currentWeights 应正确传递到日志', async () => {
    const weights = { VTI: 0.5, BND: 0.5 };
    const event = makeEvent({ currentWeights: weights });
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        currentWeights: weights,
      }),
      expect.any(String),
    );
  });

  it('payload 缺少 reason 字段时也应正常处理', async () => {
    const event = makeEvent({});
    delete (event as Record<string, unknown>).payload.reason;
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: undefined,
      }),
      expect.any(String),
    );
  });

  it('payload 缺少 currentWeights 字段时也应正常处理', async () => {
    const event = makeEvent({});
    delete (event as Record<string, unknown>).payload.currentWeights;
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        currentWeights: undefined,
      }),
      expect.any(String),
    );
  });

  it('不应调用 warn/error/debug 日志（仅 info）', async () => {
    const event = makeEvent();
    await handler.handle(event);

    expect(loggerMocks.warn).not.toHaveBeenCalled();
    expect(loggerMocks.error).not.toHaveBeenCalled();
    expect(loggerMocks.debug).not.toHaveBeenCalled();
  });

  it('不同 aggregateId 应正确传递到日志', async () => {
    const event = makeEvent();
    event.aggregateId = 'portfolio-xyz';
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'portfolio-xyz',
      }),
      expect.any(String),
    );
  });
});
