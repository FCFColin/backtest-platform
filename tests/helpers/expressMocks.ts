import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../packages/backend/src/middleware/jwtAuth.js';

interface MockRequestOverrides {
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

interface MockResponse {
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

/**
 * 等待中间件执行完成（通过 next 回调 resolve）
 *
 * 企业理由：10+ 测试文件重复 new Promise<void>((resolve) => { middleware(req, res, () => resolve()); }) 模式。
 * 本 helper 集中维护，确保 Promise 正确 resolve。
 *
 * @param middleware - Express 中间件函数
 * @param req - mock Request 对象
 * @param res - mock Response 对象
 * @param onNext - 可选的 next 回调（在 resolve 前执行）
 * @returns Promise，在中间件调用 next 后 resolve
 */
export async function awaitMiddleware(
  middleware: (req: unknown, res: unknown, next: () => void) => void,
  req: unknown,
  res: unknown,
  onNext?: () => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    middleware(req, res, () => {
      onNext?.();
      resolve();
    });
  });
}

export function createJwtAuthMockRequest(
  overrides: Record<string, unknown> = {},
): AuthenticatedRequest {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

export function createJwtAuthMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

export function createJwtAuthMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}
