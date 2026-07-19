/**
 * 测试辅助：idempotency 中间件 fixtures
 *
 * 保留 mockLongIdempotencyKey + SQL_INJECTION_KEY + XSS_KEY + NEWLINE_INJECTION_KEY
 * + createIdempotencyReqRes。
 * Phase 5.7 已清理 4 个未用导出（mockIdempotencyKey 内联到 createIdempotencyReqRes，
 * createRedisStore/mockRedisGet/mockRedisSet 整体删除）。
 *
 * 用法：
 *   import { mockLongIdempotencyKey, createIdempotencyReqRes } from '../helpers/idempotencyFixtures.js';
 *   const { req, res, next } = createIdempotencyReqRes(mockLongIdempotencyKey());
 */

import { vi } from 'vitest';
import type { Response } from 'express';
import { createMockRequest, createMockResponse } from './expressMocks.js';

/** 生成超长 key（>128 字符，用于触发 400 拒绝路径） */
export function mockLongIdempotencyKey(): string {
  return 'a'.repeat(129);
}

/** SQL 注入向量 key（用于安全测试） */
export const SQL_INJECTION_KEY = "'; DROP TABLE idempotency_keys;--";

/** XSS 载荷 key（用于安全测试） */
export const XSS_KEY = '<script>alert(1)</script>';

/** 换行符注入 key（用于安全测试） */
export const NEWLINE_INJECTION_KEY = 'valid-key\r\nX-Evil: injected';

/**
 * 创建带 idempotency-key header 的 req/res/next 三元组
 *
 * @param key - 幂等 key（默认生成 `test-key-default-<rand>`）
 * @param method - HTTP 方法（默认 POST）
 * @param path - 请求路径（默认 /api/test）
 * @returns 包含 req/res/next 的三元组（res 额外附加 on 方法）
 */
export function createIdempotencyReqRes(
  key?: string,
  method = 'POST',
  path = '/api/test',
): {
  req: ReturnType<typeof createMockRequest>;
  res: Response & { on: ReturnType<typeof vi.fn> };
  next: ReturnType<typeof vi.fn>;
} {
  const resolvedKey = key ?? `test-key-default-${Math.random().toString(16).slice(2, 10)}`;
  const req = createMockRequest({
    method,
    headers: { 'idempotency-key': resolvedKey },
    path,
    url: path,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = {
    ...createMockResponse(),
    on: vi.fn(),
  } as unknown as Response & { on: ReturnType<typeof vi.fn> };
  const next = vi.fn();
  return { req, res, next };
}
