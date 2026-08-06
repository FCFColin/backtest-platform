import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate } from '../../../packages/backend/src/middleware/miscMiddleware.js';
import {
  createMockRequest,
  createMockResponse,
  createMockNext as createMockNextFn,
} from '../../helpers/expressMocks.js';

const createMockReq = (body: unknown) => createMockRequest({ body });
const createMockRes = createMockResponse;
const createMockNext = createMockNextFn;

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
        success: false,
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/VALIDATION_ERROR',
          title: 'VALIDATION_ERROR',
          status: 400,
          code: 'VALIDATION_ERROR',
        }),
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

describe('安全攻击用例', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });

  it('原型污染：body 含 __proto__ 不应修改 Object.prototype', () => {
    const maliciousBody = JSON.parse('{"__proto__": {"admin": true}, "name": "test", "age": 25}');

    expect({}.admin).toBeUndefined();

    const req = createMockReq(maliciousBody);
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect({}.admin).toBeUndefined();
    expect((req.body as Record<string, unknown>).admin).toBeUndefined();
  });

  it('构造函数污染：body 含 constructor.prototype 不应修改 Object.prototype', () => {
    const maliciousBody = JSON.parse(
      '{"constructor": {"prototype": {"admin": true}}, "name": "test", "age": 25}',
    );

    expect({}.admin).toBeUndefined();

    const req = createMockReq(maliciousBody);
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect({}.admin).toBeUndefined();
    expect((req.body as Record<string, unknown>).admin).toBeUndefined();
  });

  it('超大 body（1MB+）应被拒绝或安全处理', () => {
    const oversizedBody = 'x'.repeat(1024 * 1024 + 1); // 1MB+ 字符串

    const req = createMockReq(oversizedBody);
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('深度嵌套 body（1000 层）应被拒绝或安全处理', () => {
    let nested: Record<string, unknown> = { name: 'deep', age: 1 };
    for (let i = 0; i < 1000; i++) {
      nested = { nested };
    }

    const req = createMockReq(nested);
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
