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

/** 创建 mock Express Request。@param overrides - 可选属性覆盖 @returns mock Request */
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

/** 创建 mock Express Response。@returns 包含 status/json/send 等方法的 mock Response */
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

/** 创建 mock Express next 函数。@returns vi.fn() 包装的 next */
export function createMockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

/** 创建中间件测试三元组（req, res, next）。@param reqOverrides - Request 属性覆盖 @returns { req, res, next } */
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

/** 等待中间件执行完成。@param middleware - Express 中间件 @param req - mock Request @param res - mock Response @param onNext - 可选 next 回调 @returns Promise */
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
