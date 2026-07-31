import { describe, it, expect } from 'vitest';
import {
  requestContextStorage,
  getRequestId,
} from '../../../packages/backend/src/utils/requestContext.js';

describe('getRequestId', () => {
  it('请求链路外应返回 undefined', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('请求链路内应返回当前 requestId', () => {
    requestContextStorage.run({ requestId: 'req-123' }, () => {
      expect(getRequestId()).toBe('req-123');
    });
  });

  it('不同的 requestId 应正确隔离', () => {
    requestContextStorage.run({ requestId: 'req-a' }, () => {
      expect(getRequestId()).toBe('req-a');
    });
    requestContextStorage.run({ requestId: 'req-b' }, () => {
      expect(getRequestId()).toBe('req-b');
    });
    // 退出 run 后应回到 undefined
    expect(getRequestId()).toBeUndefined();
  });

  it('嵌套 run 调用应使用最内层的 requestId', () => {
    requestContextStorage.run({ requestId: 'outer' }, () => {
      expect(getRequestId()).toBe('outer');
      requestContextStorage.run({ requestId: 'inner' }, () => {
        expect(getRequestId()).toBe('inner');
      });
      expect(getRequestId()).toBe('outer');
    });
  });

  it('异步操作（Promise）中上下文应正确传播', async () => {
    await requestContextStorage.run({ requestId: 'async-req' }, async () => {
      // 立即 resolve 的 Promise 应保留上下文
      await Promise.resolve();
      expect(getRequestId()).toBe('async-req');

      // setTimeout 后的异步回调应保留上下文
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(getRequestId()).toBe('async-req');
          resolve();
        }, 0);
      });
    });
  });

  it('requestContextStorage 应为 AsyncLocalStorage 实例', () => {
    expect(requestContextStorage).toBeDefined();
    expect(typeof requestContextStorage.run).toBe('function');
    expect(typeof requestContextStorage.getStore).toBe('function');
    expect(typeof requestContextStorage.enterWith).toBe('function');
  });

  it('getStore 在链路外应返回 undefined', () => {
    expect(requestContextStorage.getStore()).toBeUndefined();
  });

  it('getStore 在链路内应返回上下文对象', () => {
    requestContextStorage.run({ requestId: 'store-test' }, () => {
      const store = requestContextStorage.getStore();
      expect(store).toEqual({ requestId: 'store-test' });
    });
  });

  it('requestId 为空字符串时也应正确返回', () => {
    requestContextStorage.run({ requestId: '' }, () => {
      expect(getRequestId()).toBe('');
    });
  });

  it('并发 run 调用应互不干扰', async () => {
    const results: string[] = [];
    await Promise.all([
      requestContextStorage.run({ requestId: 'concurrent-1' }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(getRequestId()!);
      }),
      requestContextStorage.run({ requestId: 'concurrent-2' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(getRequestId()!);
      }),
    ]);

    expect(results).toContain('concurrent-1');
    expect(results).toContain('concurrent-2');
  });
});
