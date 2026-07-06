import { vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../../packages/backend/src/middleware/jwtAuth.js';

export function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createMockRequest(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

export function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

export function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}
