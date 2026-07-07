import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== React mock =====
// 使用 vi.hoisted 确保 mock 工厂能访问到状态容器
const mockState = vi.hoisted(() => {
  const stateMap: Map<number, unknown> = new Map();
  const stateIndex = { value: 0 };
  const resetState = () => {
    stateMap.clear();
    stateIndex.value = 0;
  };
  return { stateMap, stateIndex, resetState };
});

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = mockState.stateIndex.value++;
    if (!mockState.stateMap.has(index)) mockState.stateMap.set(index, initial);
    const setter = (newValue: unknown) => {
      const current = mockState.stateMap.get(index);
      mockState.stateMap.set(
        index,
        typeof newValue === 'function'
          ? (newValue as (prev: unknown) => unknown)(current)
          : newValue,
      );
    };
    return [mockState.stateMap.get(index), setter];
  },
  useCallback: <T>(fn: T): T => fn,
}));

import { useAsyncAction } from '../../../packages/frontend/src/hooks/useAsyncAction.js';

/**
 * 渲染 hook：重置状态后调用，返回带 getter 的包装对象
 * getter 始终读取最新状态，模拟 React 重渲染后的值
 */
function renderHook() {
  mockState.resetState();
  const result = useAsyncAction();
  return {
    run: result.run,
    reset: result.reset,
    setError: result.setError,
    // useState 调用顺序：isLoading=0, error=1
    get isLoading() {
      return mockState.stateMap.get(0) as boolean;
    },
    get error() {
      return mockState.stateMap.get(1) as string | null;
    },
  };
}

beforeEach(() => {
  mockState.resetState();
});

// ===== 成功执行 =====
describe('useAsyncAction - 成功执行', () => {
  it('成功执行返回结果', async () => {
    const { run } = renderHook();
    const result = await run(async () => 42);
    expect(result).toBe(42);
  });

  it('成功执行后 loading 为 false', async () => {
    const hook = renderHook();
    await hook.run(async () => 'done');
    expect(hook.isLoading).toBe(false);
  });

  it('成功执行后 error 为 null', async () => {
    const hook = renderHook();
    await hook.run(async () => 'done');
    expect(hook.error).toBeNull();
  });

  it('action 返回 null 时正常处理', async () => {
    const { run } = renderHook();
    const result = await run(async () => null);
    expect(result).toBeNull();
  });

  it('action 返回 undefined 时正常处理', async () => {
    const { run } = renderHook();
    const result = await run(async () => undefined);
    expect(result).toBeUndefined();
  });

  it('action 返回对象时正常处理', async () => {
    const { run } = renderHook();
    const obj = { foo: 'bar', count: 42 };
    const result = await run(async () => obj);
    expect(result).toEqual(obj);
  });

  it('action 返回数组时正常处理', async () => {
    const { run } = renderHook();
    const result = await run(async () => [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('action 返回 0 时正常处理（falsy 值）', async () => {
    const { run } = renderHook();
    const result = await run(async () => 0);
    expect(result).toBe(0);
  });

  it('action 返回空字符串时正常处理（falsy 值）', async () => {
    const { run } = renderHook();
    const result = await run(async () => '');
    expect(result).toBe('');
  });
});

// ===== 失败执行 =====
describe('useAsyncAction - 失败执行', () => {
  it('action 抛错时返回 undefined', async () => {
    const { run } = renderHook();
    const result = await run(async () => {
      throw new Error('test error');
    });
    expect(result).toBeUndefined();
  });

  it('action 抛 Error 时 error 为 Error.message', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('custom error message');
    });
    expect(hook.error).toBe('custom error message');
  });

  it('action 抛非 Error 值时 error 为默认消息', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw 'string error';
    });
    expect(hook.error).toBe('操作失败');
  });

  it('action 抛 null 时 error 为默认消息', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw null;
    });
    expect(hook.error).toBe('操作失败');
  });

  it('action 抛 undefined 时 error 为默认消息', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw undefined;
    });
    expect(hook.error).toBe('操作失败');
  });

  it('action 抛数字时 error 为默认消息', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw 42;
    });
    expect(hook.error).toBe('操作失败');
  });

  it('失败后 loading 为 false', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('fail');
    });
    expect(hook.isLoading).toBe(false);
  });

  it('失败后再次成功执行时 error 被清空', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('first error');
    });
    expect(hook.error).toBe('first error');
    await hook.run(async () => 'success');
    expect(hook.error).toBeNull();
  });
});

// ===== loading 状态 =====
describe('useAsyncAction - loading 状态', () => {
  it('初始 loading 为 false', () => {
    const hook = renderHook();
    expect(hook.isLoading).toBe(false);
  });

  it('初始 error 为 null', () => {
    const hook = renderHook();
    expect(hook.error).toBeNull();
  });

  it('执行过程中 loading 为 true', async () => {
    const hook = renderHook();
    let resolveFn: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    const runPromise = hook.run(async () => {
      await promise;
      return 'done';
    });
    // 在 promise resolve 前，loading 应为 true
    expect(hook.isLoading).toBe(true);
    resolveFn!();
    await runPromise;
    expect(hook.isLoading).toBe(false);
  });

  it('执行前 error 被清空', async () => {
    const hook = renderHook();
    // 先制造一个错误
    await hook.run(async () => {
      throw new Error('first error');
    });
    expect(hook.error).toBe('first error');
    // 再执行一个成功的 action，执行前 error 应被清空
    let resolveFn: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    const runPromise = hook.run(async () => {
      await promise;
      return 'success';
    });
    // 执行开始时 error 已被清空
    expect(hook.error).toBeNull();
    resolveFn!();
    await runPromise;
  });

  it('失败时 loading 最终为 false（finally 保证）', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('fail');
    });
    expect(hook.isLoading).toBe(false);
  });
});

// ===== reset =====
describe('useAsyncAction - reset', () => {
  it('reset 清空 error', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('test');
    });
    expect(hook.error).toBe('test');
    hook.reset();
    expect(hook.error).toBeNull();
  });

  it('reset 设置 loading 为 false', () => {
    const hook = renderHook();
    hook.reset();
    expect(hook.isLoading).toBe(false);
  });

  it('reset 后可再次正常执行', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('fail');
    });
    hook.reset();
    const result = await hook.run(async () => 'success');
    expect(result).toBe('success');
    expect(hook.error).toBeNull();
  });
});

// ===== setError =====
describe('useAsyncAction - setError', () => {
  it('手动设置 error', () => {
    const hook = renderHook();
    hook.setError('manual error');
    expect(hook.error).toBe('manual error');
  });

  it('setError(null) 清空 error', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('auto error');
    });
    hook.setError(null);
    expect(hook.error).toBeNull();
  });

  it('setError 不触发 loading', () => {
    const hook = renderHook();
    hook.setError('test');
    expect(hook.isLoading).toBe(false);
  });

  it('setError 可覆盖已有 error', () => {
    const hook = renderHook();
    hook.setError('first');
    hook.setError('second');
    expect(hook.error).toBe('second');
  });
});

// ===== 并发调用与边界情况 =====
describe('useAsyncAction - 并发调用与边界情况', () => {
  it('多次 run 不会互相阻塞', async () => {
    const hook = renderHook();
    const p1 = hook.run(async () => 1);
    const p2 = hook.run(async () => 2);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('action 立即抛错（同步抛错）也能被捕获', async () => {
    const hook = renderHook();
    const result = await hook.run(async () => {
      throw new Error('immediate');
    });
    expect(result).toBeUndefined();
    expect(hook.error).toBe('immediate');
  });

  it('action 立即返回（非异步）也能正常处理', async () => {
    const hook = renderHook();
    const result = await hook.run(async () => 'instant');
    expect(result).toBe('instant');
  });

  it('连续成功执行多次', async () => {
    const hook = renderHook();
    for (let i = 0; i < 5; i++) {
      const result = await hook.run(async () => i);
      expect(result).toBe(i);
      expect(hook.error).toBeNull();
      expect(hook.isLoading).toBe(false);
    }
  });

  it('连续失败执行多次', async () => {
    const hook = renderHook();
    for (let i = 0; i < 3; i++) {
      const result = await hook.run(async () => {
        throw new Error(`error-${i}`);
      });
      expect(result).toBeUndefined();
      expect(hook.error).toBe(`error-${i}`);
      expect(hook.isLoading).toBe(false);
    }
  });
});
