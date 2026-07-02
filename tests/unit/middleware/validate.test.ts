/**
 * validate 中间件单元测试
 *
 * 企业理由：请求体校验是API安全的第一道防线，必须确保：
 * - 无效输入返回400和RFC 7807格式错误
 * - 有效输入通过校验并替换req.body为解析后的数据
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate } from '../../../api/middleware/validate.js';
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

describe('安全攻击用例', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });

  it('原型污染：body 含 __proto__ 不应修改 Object.prototype', () => {
    // 使用 JSON.parse 模拟来自 HTTP 请求的 body（__proto__ 作为自有属性）
    const maliciousBody = JSON.parse('{"__proto__": {"admin": true}, "name": "test", "age": 25}');

    // 确保测试前 Object.prototype 未被污染
    expect({}.admin).toBeUndefined();

    const req = createMockReq(maliciousBody);
    const res = createMockRes();
    const next = createMockNext();

    validate(testSchema)(req, res, next);

    // 验证通过（name 和 age 符合 schema）
    expect(next).toHaveBeenCalled();
    // 关键安全断言：Object.prototype 未被污染
    expect({}.admin).toBeUndefined();
    // 解析后的 body 不应包含 admin 属性
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
    // 关键安全断言：Object.prototype 未被污染
    expect({}.admin).toBeUndefined();
    expect((req.body as Record<string, unknown>).admin).toBeUndefined();
  });

  it('超大 body（1MB+）应被拒绝或安全处理', () => {
    // 构造 1MB+ 的无效 body（字符串而非对象，不匹配 schema）
    const oversizedBody = 'x'.repeat(1024 * 1024 + 1); // 1MB+ 字符串

    const req = createMockReq(oversizedBody);
    const res = createMockRes();
    const next = createMockNext();

    // validate 应安全处理，不崩溃，返回 400（类型不匹配）
    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('深度嵌套 body（1000 层）应被拒绝或安全处理', () => {
    // 构造 1000 层嵌套对象
    let nested: Record<string, unknown> = { name: 'deep', age: 1 };
    for (let i = 0; i < 1000; i++) {
      nested = { nested };
    }

    const req = createMockReq(nested);
    const res = createMockRes();
    const next = createMockNext();

    // validate 应安全处理，不崩溃
    // 嵌套对象缺少 name/age 顶层字段 → 400
    validate(testSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
