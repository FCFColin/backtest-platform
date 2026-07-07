/**
 * 测试辅助：Express 中间件 Mock 工厂
 *
 * 企业理由：6+ 个中间件测试文件各自定义略有不同的 mock 请求/响应/next
 * 辅助函数，签名不一致且大量使用 any。本模块集中维护类型安全的 mock 工厂，
 * 消除重复，确保行为一致。
 *
 * 用法：
 *   import { createMockRequest, createMockResponse, createMockNext } from '../helpers/expressMocks.js';
 *   const req = createMockRequest({ method: 'POST', body: { name: 'test' } });
 *   const res = createMockResponse();
 *   const next = createMockNext();
 */

import { vi } from 'vitest';
import type { Request } from 'express';

/** Mock Request 的可扩展属性类型 */
export interface MockRequestOverrides {
  method?: string;
  url?: string;
  path?: string;
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
  user?: unknown;
  tenantId?: string;
  [key: string]: unknown;
}

/** Mock Response 方法集合 */
export interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn> & { (body: unknown): void };
  send: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  header: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  statusCode: number;
  headersSent: boolean;
  _finishCallback?: () => void;
  [key: string]: unknown;
}

/**
 * 创建 mock Express Request 对象
 *
 * @param overrides - 可选属性覆盖（method, body, user, tenantId 等）
 * @returns 类型安全的 mock Request 对象，可通过 [key: string] 扩展
 */
export function createMockRequest(overrides: MockRequestOverrides = {}): Request {
  return {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/',
    path: overrides.path ?? '/',
    body: overrides.body ?? {},
    query: overrides.query ?? {},
    params: overrides.params ?? {},
    headers: overrides.headers ?? {},
    user: overrides.user,
    tenantId: overrides.tenantId,
    ...overrides,
  } as Request;
}

/**
 * 创建 mock Express Response 对象
 *
 * @returns 包含 status/json/send/end/set/header 等方法的 mock Response
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    get: vi.fn(),
    statusCode: 200,
    headersSent: false,
  };
  return res;
}

/**
 * 创建 mock Express next 函数
 *
 * @returns vi.fn() 包装的 next 函数
 */
export function createMockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

/**
 * 创建完整的中间件测试三元组（req, res, next）
 *
 * @param reqOverrides - Request 属性覆盖
 * @returns { req, res, next } 三元组
 */
export function createMockMiddleware(reqOverrides?: MockRequestOverrides): {
  req: Request;
  res: MockResponse;
  next: ReturnType<typeof vi.fn>;
} {
  return {
    req: createMockRequest(reqOverrides),
    res: createMockResponse(),
    next: createMockNext(),
  };
}
