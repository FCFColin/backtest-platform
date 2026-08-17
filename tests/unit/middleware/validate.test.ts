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
const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().positive(),
});
const run = (body: unknown) => {
  const req = createMockReq(body);
  const res = createMockRes();
  const next = createMockNext();
  validate(testSchema)(req, res, next);
  return { req, res, next };
};

describe('validate middleware', () => {
  it('should return 400 for invalid input', () => {
    const { res, next } = run({ name: '', age: -1 });

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
    const { req, res, next } = run({ name: 'test', age: 25 });

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'test', age: 25 });
  });

  it('should return 400 for missing required fields', () => {
    const { res, next } = run({});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 for wrong types', () => {
    const { res, next } = run({ name: 123, age: 'not a number' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('安全攻击用例', () => {
  it.each([
    ['原型污染：body 含 __proto__', '{"__proto__": {"admin": true}, "name": "test", "age": 25}'],
    [
      '构造函数污染：body 含 constructor.prototype',
      '{"constructor": {"prototype": {"admin": true}}, "name": "test", "age": 25}',
    ],
  ])('%s 不应修改 Object.prototype', (_name, payload) => {
    const body = JSON.parse(payload);

    expect(({} as Record<string, unknown>).admin).toBeUndefined();

    const { req, next } = run(body);

    expect(next).toHaveBeenCalled();
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect((req.body as Record<string, unknown>).admin).toBeUndefined();
  });
});
