/**
 * 测试辅助：data service Go HTTP 调用 stub
 *
 * 仅保留 setupHttpGetSuccess + setupHttpGetError。
 * Phase 5.5 已清理 4 个未用导出（createCircuitBreakerMock/mockTickerData/
 * mockDataServiceResponse/createFsSyncMock）。
 *
 * 用法：
 *   import { setupHttpGetSuccess, setupHttpGetError } from '../helpers/dataServiceFixtures.js';
 *   setupHttpGetSuccess(JSON.stringify({ success: true, data: [...] }));
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * 模拟 http.request 成功响应（基于 EventEmitter 回调风格）
 *
 * @param body - 响应体字符串
 * @param statusCode - HTTP 状态码（默认 200）
 * @returns vi.fn mock，接收 (url, opts, callback) 三元组
 */
export function setupHttpGetSuccess(body: string, statusCode = 200): ReturnType<typeof vi.fn> {
  return vi.fn(
    (
      _url: string,
      _opts: unknown,
      callback: (res: EventEmitter & { statusCode: number }) => void,
    ) => {
      const req = new EventEmitter() as unknown as {
        destroy: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        emit: (event: string, ...args: unknown[]) => boolean;
      };
      req.destroy = vi.fn();
      req.on = vi.fn();
      req.end = vi.fn();
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = statusCode;
      queueMicrotask(() => {
        callback(res);
        res.emit('data', Buffer.from(body));
        res.emit('end');
      });
      return req;
    },
  );
}

/**
 * 模拟 http.request 网络错误（基于 EventEmitter error 事件）
 *
 * @param message - 错误消息
 * @returns vi.fn mock，接收 (url, opts, callback) 三元组
 */
export function setupHttpGetError(message: string): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, _opts: unknown, _callback: unknown) => {
    const req = new EventEmitter() as unknown as {
      destroy: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      emit: (event: string, ...args: unknown[]) => boolean;
    };
    req.destroy = vi.fn();
    req.on = vi.fn((event: string, handler: (err: Error) => void) => {
      if (event === 'error') queueMicrotask(() => handler(new Error(message)));
    });
    req.end = vi.fn();
    return req;
  });
}
