import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { useAsyncAction } from '../../../packages/frontend/src/hooks/miscHooks.js';

function renderHook() {
  mockState.resetState();
  const result = useAsyncAction();
  return {
    run: result.run,
    reset: result.reset,
    setError: result.setError,
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

describe('useAsyncAction - 成功执行', () => {
  it.each<[string, () => Promise<unknown>, unknown]>([
    ['数字', async () => 42, 42],
    ['null', async () => null, null],
    ['undefined', async () => undefined, undefined],
    ['对象', async () => ({ foo: 'bar', count: 42 }), { foo: 'bar', count: 42 }],
    ['数组', async () => [1, 2, 3], [1, 2, 3]],
    ['falsy 0', async () => 0, 0],
    ['falsy 空字符串', async () => '', ''],
  ])('action 返回 %s 时原样返回结果', async (_n, action, expected) => {
    const { run } = renderHook();
    expect(await run(action)).toEqual(expected);
  });

  it('成功执行后 loading=false 且 error=null', async () => {
    const hook = renderHook();
    await hook.run(async () => 'done');
    expect(hook.isLoading).toBe(false);
    expect(hook.error).toBeNull();
  });
});

describe('useAsyncAction - 失败执行', () => {
  it('action 抛 Error 时 error 为 message 且返回 undefined', async () => {
    const hook = renderHook();
    const result = await hook.run(async () => {
      throw new Error('custom error message');
    });
    expect(result).toBeUndefined();
    expect(hook.error).toBe('custom error message');
  });

  it.each([
    ['字符串', 'string error'],
    ['null', null],
    ['undefined', undefined],
    ['数字', 42],
  ])('action 抛 %s 时 error 为默认消息且 loading=false', async (_n, thrown) => {
    const hook = renderHook();
    const result = await hook.run(async () => {
      throw thrown;
    });
    expect(result).toBeUndefined();
    expect(hook.error).toBe('操作失败');
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

describe('useAsyncAction - loading 状态', () => {
  it('初始 loading=false 且 error=null', () => {
    const hook = renderHook();
    expect(hook.isLoading).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('执行过程中 loading 为 true，完成后为 false', async () => {
    const hook = renderHook();
    let resolveFn: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    const runPromise = hook.run(async () => {
      await promise;
      return 'done';
    });
    expect(hook.isLoading).toBe(true);
    resolveFn!();
    await runPromise;
    expect(hook.isLoading).toBe(false);
  });

  it('执行前 error 被清空', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('first error');
    });
    let resolveFn: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    const runPromise = hook.run(async () => {
      await promise;
      return 'success';
    });
    expect(hook.error).toBeNull();
    resolveFn!();
    await runPromise;
  });
});

describe('useAsyncAction - reset', () => {
  it('reset 清空 error 并设置 loading=false', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('test');
    });
    hook.reset();
    expect(hook.error).toBeNull();
    expect(hook.isLoading).toBe(false);
  });

  it('reset 后可再次正常执行', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('fail');
    });
    hook.reset();
    expect(await hook.run(async () => 'success')).toBe('success');
    expect(hook.error).toBeNull();
  });
});

describe('useAsyncAction - setError', () => {
  it('手动设置 error 不触发 loading', () => {
    const hook = renderHook();
    hook.setError('manual error');
    expect(hook.error).toBe('manual error');
    expect(hook.isLoading).toBe(false);
  });

  it('setError(null) 清空 error', async () => {
    const hook = renderHook();
    await hook.run(async () => {
      throw new Error('auto error');
    });
    hook.setError(null);
    expect(hook.error).toBeNull();
  });

  it('setError 可覆盖已有 error', () => {
    const hook = renderHook();
    hook.setError('first');
    hook.setError('second');
    expect(hook.error).toBe('second');
  });
});

describe('useAsyncAction - 并发调用与边界情况', () => {
  it('多次 run 不会互相阻塞', async () => {
    const hook = renderHook();
    const [r1, r2] = await Promise.all([hook.run(async () => 1), hook.run(async () => 2)]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it.each([
    [
      '立即抛错',
      async () => {
        throw new Error('immediate');
      },
      undefined,
      'immediate',
    ],
    ['立即返回', async () => 'instant', 'instant', null],
  ])('action %s 也能正常处理', async (_n, action, expected, expectedError) => {
    const hook = renderHook();
    expect(await hook.run(action)).toBe(expected);
    expect(hook.error).toBe(expectedError);
  });

  it('连续成功执行多次', async () => {
    const hook = renderHook();
    for (let i = 0; i < 5; i++) {
      expect(await hook.run(async () => i)).toBe(i);
      expect(hook.error).toBeNull();
      expect(hook.isLoading).toBe(false);
    }
  });

  it('连续失败执行多次', async () => {
    const hook = renderHook();
    for (let i = 0; i < 3; i++) {
      expect(
        await hook.run(async () => {
          throw new Error(`error-${i}`);
        }),
      ).toBeUndefined();
      expect(hook.error).toBe(`error-${i}`);
      expect(hook.isLoading).toBe(false);
    }
  });
});
