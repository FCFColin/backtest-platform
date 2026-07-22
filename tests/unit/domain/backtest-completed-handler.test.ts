/**
 * BacktestCompletedHandler 单元测试
 *
 * ADR-024 / T-11：处理器已重构为**纯观测副作用**（仅日志/指标），不再写 outbox。
 * 企业理由：outbox 的唯一写入点为 application/backtest-service 的事务写入；
 * 处理器再写 outbox 会造成重复写入并形成 OutboxPublisher→dispatch→再写→NOTIFY 的反馈环。
 * 本测试覆盖：
 * - 正确订阅 BacktestCompleted 事件类型
 * - handle 正确记录日志（含 totalReturn/maxDrawdown/sharpeRatio）
 * - handle 不再访问数据库（不写 outbox、不发 NOTIFY）
 * - 缺失指标字段时仍正常处理
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

// db/getPool 仍 mock：用于断言处理器**不再**访问数据库。
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks),
}));

import { BacktestCompletedHandler } from '../../../packages/backend/src/application/backtestCompletedHandler.js';
import type { DomainEvent } from '../../../packages/backend/src/domain/events/EventDispatcher.js';

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
