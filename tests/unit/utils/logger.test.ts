/**
 * logger 单元测试
 *
 * 企业理由：结构化日志是 SRE 排障的基础，logger 模块导出的 logger
 * 与 httpLogger 必须保证：
 * - logger 是 pino 实例，具备 info/warn/error/debug 方法
 * - httpLogger 是 pino-http 中间件函数
 * - 开发环境使用 debug 级别，生产环境使用 info 级别
 *
 * 权衡：不验证 OTel mixin 与 redact 行为（需集成测试），
 * 仅锁定模块导出契约。
 */

import { describe, it, expect, vi } from 'vitest';
import { logger, httpLogger } from '../../../api/utils/logger.js';

describe('logger', () => {
  it('应导出 logger 对象', () => {
    expect(logger).toBeDefined();
    expect(typeof logger).toBe('object');
  });

  it('logger 应具备标准日志方法', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('logger 应支持 child 方法（pino 标准接口）', () => {
    expect(typeof logger.child).toBe('function');
  });

  it('logger.info 调用不应抛出异常', () => {
    expect(() => logger.info({ test: true }, 'test message')).not.toThrow();
  });

  it('logger.warn 调用不应抛出异常', () => {
    expect(() => logger.warn({ test: true }, 'test warning')).not.toThrow();
  });

  it('logger.error 调用不应抛出异常', () => {
    expect(() => logger.error({ test: true }, 'test error')).not.toThrow();
  });

  it('logger.debug 调用不应抛出异常', () => {
    expect(() => logger.debug({ test: true }, 'test debug')).not.toThrow();
  });

  it('logger.child 应返回子 logger 实例', () => {
    const child = logger.child({ module: 'test' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
  });
});

describe('httpLogger', () => {
  it('应导出 httpLogger 函数（pino-http 中间件）', () => {
    expect(httpLogger).toBeDefined();
    expect(typeof httpLogger).toBe('function');
  });

  it('httpLogger 作为 Express 中间件调用不应抛出异常', () => {
    // pino-http 中间件签名：(req, res, next) => void
    // pino-http 会在 res 上注册 'finish' 事件监听器，故 mock 需提供 res.on
    const mockReq = { headers: {} } as unknown as import('express').Request;
    const mockRes = { on: vi.fn() } as unknown as import('express').Response;
    const mockNext = vi.fn();
    expect(() => httpLogger(mockReq, mockRes, mockNext)).not.toThrow();
  });
});
