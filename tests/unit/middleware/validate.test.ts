/**
 * validate 中间件单元测试
 *
 * 企业理由：请求体校验是API安全的第一道防线，必须确保：
 * - 无效输入返回400和RFC 7807格式错误
 * - 有效输入通过校验并替换req.body为解析后的数据
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../../../api/middleware/validate.js';
import type { Request, Response, NextFunction } from 'express';

function createMockReq(body: unknown): Request {
  return { body } as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createMockNext(): NextFunction {
  return vi.fn() as NextFunction;
}

describe('validate middleware', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });

  it('should return 400 for invalid input', () => {
    const req = createMockReq({ name: '', age: -1 });
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://httpstatuses.com/400',
        title: 'Bad Request',
        status: 400,
        detail: expect.stringContaining('Request validation failed'),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() and replace req.body for valid input', () => {
    const req = createMockReq({ name: 'test', age: 25 });
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'test', age: 25 });
  });

  it('should return 400 for missing required fields', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 for wrong types', () => {
    const req = createMockReq({ name: 123, age: 'not a number' });
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
