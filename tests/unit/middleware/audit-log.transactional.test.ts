/**
 * auditLog 事务双写单元测试（Task 11.4）
 *
 * 企业理由：writeOutboxEvent 现支持两种模式：
 * 1. 独立模式（无 client）：使用连接池 + NOTIFY，向后兼容中间件异步调用
 * 2. 事务模式（传入 client）：参与调用方事务，不发送 NOTIFY，异常向上传播触发 ROLLBACK
 *
 * 测试覆盖：
 * - 事务模式下使用传入的 client（而非 getPool）
 * - 事务模式下不发送 NOTIFY（NOTIFY 应由调用方在 COMMIT 后发送）
 * - 事务模式下异常向上传播（触发 ROLLBACK）
 * - 独立模式下使用连接池
 * - 独立模式下发送 NOTIFY
 * - 独立模式下异常被吞掉（不阻塞响应）
 *
 * 权衡：不修改既有 audit-log.test.ts（保持向后兼容测试稳定），
 * 新增独立测试文件覆盖事务双写契约。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前就绑定 =====
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const poolMocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

// Mock logger
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

// Mock db/index.js：getPool 返回带 mock query 的对象
vi.mock('../../../packages/backend/src/db/index.js', () => ({
  getPool: () => ({ query: poolMocks.query }),
}));

import { writeOutboxEvent } from '../../../packages/backend/src/middleware/auditLog.js';

/** 构造一个 mock PoolClient，记录所有 query 调用 */
function createMockClient(): PoolClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: vi.fn(),
  } as unknown as PoolClient & { query: ReturnType<typeof vi.fn> };
}

describe('writeOutboxEvent 事务双写', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 pool query mock 默认成功
    poolMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  describe('事务模式（传入 client）', () => {
    it('应使用传入的 client 而非连接池', async () => {
      const mockClient = createMockClient();
      const auditEntry = { userId: 'user-123', method: 'POST', path: '/api/test' };

      await writeOutboxEvent(auditEntry, mockClient);

      // 应使用 client.query，而非 pool.query
      expect(mockClient.query).toHaveBeenCalled();
      expect(poolMocks.query).not.toHaveBeenCalled();
    });

    it('不应发送 NOTIFY（NOTIFY 应由调用方在 COMMIT 后发送）', async () => {
      const mockClient = createMockClient();
      const auditEntry = { userId: 'user-123', method: 'POST', path: '/api/test' };

      await writeOutboxEvent(auditEntry, mockClient);

      // 应只调用一次 query（INSERT），不应有第二次 NOTIFY 调用
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      // 验证唯一的 query 是 INSERT，而非 NOTIFY
      const sqlArg = mockClient.query.mock.calls[0][0] as string;
      expect(sqlArg).toContain('INSERT INTO outbox');
      expect(sqlArg).not.toContain('NOTIFY');
    });

    it('应使用正确的 INSERT SQL 与参数', async () => {
      const mockClient = createMockClient();
      const auditEntry = { userId: 'user-123', method: 'POST', path: '/api/test' };

      await writeOutboxEvent(auditEntry, mockClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining(['audit', 'user-123', 'AuditEvent']),
      );
    });

    it('异常应向上传播（触发调用方 ROLLBACK）', async () => {
      const mockClient = createMockClient();
      const dbError = new Error('transaction conflict');
      mockClient.query.mockRejectedValueOnce(dbError);

      const auditEntry = { userId: 'user-123', method: 'POST', path: '/api/test' };

      // 事务模式下异常应向上传播，而非被吞掉
      await expect(writeOutboxEvent(auditEntry, mockClient)).rejects.toThrow(
        'transaction conflict',
      );
      // 应记录 error 日志（区别于独立模式的 warn）
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });

  describe('独立模式（无 client）', () => {
    it('应使用连接池（getPool）', async () => {
      const auditEntry = { userId: 'user-456', method: 'PUT', path: '/api/update' };

      await writeOutboxEvent(auditEntry);

      // 应使用 pool.query
      expect(poolMocks.query).toHaveBeenCalled();
    });

    it('应发送 NOTIFY outbox_channel', async () => {
      const auditEntry = { userId: 'user-456', method: 'PUT', path: '/api/update' };

      await writeOutboxEvent(auditEntry);

      // 应调用两次 query：INSERT + NOTIFY
      expect(poolMocks.query).toHaveBeenCalledTimes(2);
      // 第二次调用应是 NOTIFY
      const notifyCall = poolMocks.query.mock.calls[1];
      expect(notifyCall[0]).toBe('NOTIFY outbox_channel');
    });

    it('异常应被吞掉（不阻塞响应），仅记录 warn', async () => {
      const dbError = new Error('pool connection failed');
      poolMocks.query.mockRejectedValueOnce(dbError);

      const auditEntry = { userId: 'user-456', method: 'PUT', path: '/api/update' };

      // 独立模式不应抛出（中间件异步调用不阻塞响应）
      await expect(writeOutboxEvent(auditEntry)).resolves.toBeUndefined();
      // 应记录 warn 日志（区别于事务模式的 error）
      expect(loggerMocks.warn).toHaveBeenCalled();
    });
  });
});
