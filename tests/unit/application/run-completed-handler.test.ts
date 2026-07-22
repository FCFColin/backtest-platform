/**
 * RunCompletedHandler 单元测试
 *
 * ADR-013 Phase 3：处理器为纯观测副作用（仅日志），不访问数据库、不重复持久化。
 * Run 聚合根的持久化由 worker 的 save() 完成；本 handler 仅消费 RunCompleted 事件做日志。
 *
 * 覆盖：
 * - 正确订阅 RunCompleted 事件类型
 * - handle 正确记录日志（含 aggregateId/ownerUserId）
 * - handle 不访问数据库
 * - handle 不抛出错误
 * - payload 缺字段时也正常处理
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

const poolMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

// db/getPool 仍 mock：用于断言处理器不访问数据库。
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks),
  withTenant: vi.fn(),
}));

import { RunCompletedHandler } from '../../../packages/backend/src/application/runCompletedHandler.js';
import type { DomainEvent } from '../../../packages/backend/src/domain/events/EventDispatcher.js';

function makeEvent(payload: Record<string, unknown> = {}): DomainEvent {
  return {
    eventType: 'RunCompleted',
    aggregateType: 'Run',
    aggregateId: 'run-1',
    payload: {
      name: 'optimizer',
      portfolioId: 'portfolio-1',
      ownerUserId: 'user-1',
      ...payload,
    },
    occurredAt: new Date('2024-06-15T00:00:00Z'),
  };
}

describe('RunCompletedHandler', () => {
  let handler: RunCompletedHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new RunCompletedHandler();
  });

  it('应订阅 RunCompleted 事件类型', () => {
    expect(handler.eventType).toBe('RunCompleted');
  });

  it('handle 应记录 info 日志（含 aggregateId + ownerUserId）', async () => {
    const event = makeEvent();
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'RunCompleted',
        aggregateId: 'run-1',
        runName: 'optimizer',
        portfolioId: 'portfolio-1',
        ownerUserId: 'user-1',
      }),
      expect.stringContaining('Run 聚合根已进入 completed 态'),
    );
  });

  it('handle 不应访问数据库（不重复持久化）', async () => {
    const event = makeEvent();
    await handler.handle(event);

    expect(poolMocks.query).not.toHaveBeenCalled();
  });

  it('handle 不应抛出错误', async () => {
    const event = makeEvent();
    await expect(handler.handle(event)).resolves.toBeUndefined();
  });

  it('payload 缺字段时也应正常处理', async () => {
    const event = makeEvent({});
    (event as Record<string, unknown>).payload = {};
    await handler.handle(event);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'RunCompleted',
        aggregateId: 'run-1',
        runName: undefined,
        portfolioId: undefined,
        ownerUserId: undefined,
      }),
      expect.stringContaining('Run 聚合根已进入 completed 态'),
    );
  });
});
