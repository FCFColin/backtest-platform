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

export function createMockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

export function createMockMiddleware(reqOverrides?: MockRequestOverrides) {
  return {
    req: createMockRequest(reqOverrides),
    res: createMockResponse(),
    next: createMockNext(),
  };
}

export async function awaitMiddleware(
  middleware: (req: unknown, res: unknown, next: () => void) => void,
  req: unknown,
  res: unknown,
  onNext?: () => void,
): Promise<void> {
  return new Promise<void>((resolve) =>
    middleware(req, res, () => {
      onNext?.();
      resolve();
    }),
  );
}

export const createJwtAuthMockRequest = (o: Record<string, unknown> = {}) =>
  createMockRequest(o) as unknown as AuthenticatedRequest;
export const createJwtAuthMockResponse = () => createMockResponse() as unknown as Response;
export const createJwtAuthMockNext = () => createMockNext() as unknown as NextFunction;
