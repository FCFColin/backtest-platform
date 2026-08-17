import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { apiFetchMock, apiPostJSONMock, authStoreMock, reportErrorMock, toastMock } = vi.hoisted(
  () => ({
    apiFetchMock: vi.fn(),
    apiPostJSONMock: vi.fn(),
    reportErrorMock: vi.fn(),
    toastMock: vi.fn(),
    authStoreMock: {
      logout: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: () => true,
      org: { id: 'org-1' },
      user: { orgRole: 'admin' },
    },
  }),
);

vi.mock('react-router', () => ({ useNavigate: vi.fn() }));
vi.mock('../../../packages/frontend/src/store/authStore', () => ({
  useAuthStore: (selector: (s: typeof authStoreMock) => unknown) => selector(authStoreMock),
}));
vi.mock('../../../packages/frontend/src/store/toastStore', () => ({
  useToastStore: { getState: () => ({ addToast: toastMock }) },
}));
vi.mock('../../../packages/frontend/src/utils/errorReporter', () => ({
  reportError: reportErrorMock,
}));
vi.mock('../../../packages/frontend/src/utils/apiClient', () => ({
  apiFetch: apiFetchMock,
  apiPostJSON: apiPostJSONMock,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

import {
  useListState,
  usePolling,
  useTickerMeta,
  useOrgAuth,
  useSetterState,
  useAssetList,
  useReducedMotion,
  useChartAnimation,
  useAdminFetch,
  useComputeTool,
  useAnalysisState,
  useOptimizerLikeState,
  useChartCalcWorker,
  useDataMeta,
} from '../../../packages/frontend/src/hooks/miscHooks';

function stubMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mq = {
    matches,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_t: string, cb: (e: { matches: boolean }) => void) =>
      listeners.push(cb),
    ),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
  return { mq, listeners };
}

describe('useListState', () => {
  it('应初始化为传入数组', () => {
    const { result } = renderHook(() => useListState([1, 2], () => 0));
    expect(result.current.items).toEqual([1, 2]);
  });

  it('addItem 应追加默认值', () => {
    const { result } = renderHook(() => useListState([1], () => 42));
    act(() => result.current.addItem());
    expect(result.current.items).toEqual([1, 42]);
  });

  it('removeItem 应删除指定索引', () => {
    const { result } = renderHook(() => useListState([1, 2, 3], () => 0));
    act(() => result.current.removeItem(1));
    expect(result.current.items).toEqual([1, 3]);
  });

  it('removeItem 不应低于 minLength', () => {
    const { result } = renderHook(() => useListState([1], () => 0, 1));
    act(() => result.current.removeItem(0));
    expect(result.current.items).toEqual([1]);
  });

  it('updateItem 应更新指定索引', () => {
    const { result } = renderHook(() => useListState([{ x: 1 }], () => ({ x: 0 })));
    act(() => result.current.updateItem(0, (prev) => ({ x: prev.x + 10 })));
    expect(result.current.items[0]).toEqual({ x: 11 });
  });
});

describe('usePolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enabled=true 时应立即调用并按间隔轮询', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, { immediate: true }));
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('immediate=false 时不立即调用', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, { immediate: false }));
    expect(fn).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('enabled=false 时不轮询', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, { enabled: false }));
    act(() => vi.advanceTimersByTime(5000));
    expect(fn).not.toHaveBeenCalled();
  });

  it('卸载时应清除定时器', () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => usePolling(fn, 1000));
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('useTickerMeta', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('空 ticker 时应返回 null', () => {
    const { result } = renderHook(() => useTickerMeta(''));
    expect(result.current).toBeNull();
  });

  it('应延迟请求并返回解包后的 ticker meta', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { ticker: 'AAPL', name: 'Apple', exchange: 'NASDAQ', currency: 'usd' },
      }),
    });
    const { result } = renderHook(() => useTickerMeta('AAPL'));
    expect(result.current).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/data/ticker-meta?ticker=AAPL'),
      { silent: true },
    );
    expect(result.current).toEqual({
      ticker: 'AAPL',
      name: 'Apple',
      exchange: 'NASDAQ',
      currency: 'usd',
    });
  });

  it('API 失败时应返回 null', async () => {
    apiFetchMock.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useTickerMeta('FAIL'));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeNull();
  });

  it('API 抛异常时应返回 null', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useTickerMeta('REJECT'));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeNull();
  });
});

describe('useOrgAuth', () => {
  it('应从 authStore 取鉴权与组织信息', () => {
    const { result } = renderHook(() => useOrgAuth());
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.org).toEqual({ id: 'org-1' });
    expect(result.current.orgRole).toBe('admin');
    expect(result.current.isAdmin).toBe(true);
  });
});

describe('useSetterState', () => {
  it('应为每个字段生成 set 方法并更新状态', () => {
    const { result } = renderHook(() => useSetterState({ name: 'a', qty: 2 }));
    act(() => result.current.setName('b'));
    act(() => result.current.setQty(5));
    expect(result.current.name).toBe('b');
    expect(result.current.qty).toBe(5);
  });
});

describe('useAssetList', () => {
  it('应支持增删改与总权重计算，且不低过 minLength', () => {
    const asset = (t: string, w: number) => ({ ticker: t, weight: w });
    const { result } = renderHook(() => useAssetList([asset('AAPL', 60)], () => asset('BND', 40)));
    expect(result.current.totalWeight).toBe(60);
    act(() => result.current.addAsset());
    expect(result.current.assets).toHaveLength(2);
    expect(result.current.totalWeight).toBe(100);
    act(() => result.current.updateAsset(0, 'weight', 30));
    expect(result.current.totalWeight).toBe(70);
    act(() => result.current.removeAsset(0));
    expect(result.current.assets).toHaveLength(1);
    act(() => result.current.removeAsset(0));
    expect(result.current.assets).toHaveLength(1);
  });
});

describe('useReducedMotion / useChartAnimation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('应响应 prefers-reduced-motion 变更并通知图表动画', () => {
    const { listeners } = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => listeners.forEach((cb) => cb({ matches: true })));
    expect(result.current).toBe(true);
  });

  it('useChartAnimation 应随大数据集/减动偏好关闭动画', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useChartAnimation(true));
    expect(result.current).toEqual({ isAnimationActive: false });
  });
});

describe('useAdminFetch', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    reportErrorMock.mockReset();
    toastMock.mockReset();
  });

  it('成功路径应解析数据并写入刷新时间', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { n: 3 } }),
    });
    const parser = vi.fn((d: Record<string, unknown>) => ({ count: d.n as number }));
    const { result } = renderHook(() =>
      useAdminFetch<{ count: number }>('/api/v1/admin/x', parser, { count: 0 }, 'TestComp'),
    );
    await act(async () => {
      result.current.fetch();
    });
    expect(parser).toHaveBeenCalledWith({ n: 3 });
    expect(result.current.data).toEqual({ count: 3 });
    expect(result.current.lastRefresh).not.toBe('');
  });

  it('响应非成功时保持初始数据', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    const { result } = renderHook(() => useAdminFetch<number>('/u', () => 1, 0, 'C'));
    await act(async () => {
      result.current.fetch();
    });
    expect(result.current.data).toBe(0);
  });

  it('请求异常时报错并弹出 toast', async () => {
    apiFetchMock.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useAdminFetch<number>('/u', () => 1, 0, 'C'));
    await act(async () => {
      result.current.fetch();
    });
    expect(reportErrorMock).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('error', expect.any(String));
    expect(result.current.loading).toBe(false);
  });
});

describe('useComputeTool', () => {
  it('校验通过时执行计算并写入 results', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useComputeTool(compute, () => null));
    await act(async () => {
      result.current.runCompute();
    });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(result.current.results).toEqual({ ok: true });
    expect(result.current.isLoading).toBe(false);
  });

  it('校验失败时设置 error 且不执行计算', () => {
    const compute = vi.fn();
    const { result } = renderHook(() => useComputeTool(compute, () => 'invalid'));
    act(() => result.current.runCompute());
    expect(compute).not.toHaveBeenCalled();
    expect(result.current.error).toBe('invalid');
  });

  it('reset 应清空 results', async () => {
    const compute = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useComputeTool(compute, () => null));
    await act(async () => {
      result.current.runCompute();
    });
    expect(result.current.results).toBe(1);
    act(() => result.current.reset());
    expect(result.current.results).toBeNull();
  });
});

describe('useAnalysisState', () => {
  beforeEach(() => apiPostJSONMock.mockReset());

  it('校验失败时设置 error 且不调用接口', () => {
    const { result } = renderHook(() =>
      useAnalysisState<{ a: number }, { r: number }>(
        '/api/v1/analysis/x',
        { a: 1 },
        (s) => ({ a: s.a }),
        () => 'bad input',
      ),
    );
    act(() => result.current.runAnalysis());
    expect(apiPostJSONMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe('bad input');
  });

  it('校验通过时调用 apiPostJSON 并写入 results', async () => {
    apiPostJSONMock.mockResolvedValue({ r: 7 });
    const { result } = renderHook(() =>
      useAnalysisState<{ a: number }, { r: number }>(
        '/api/v1/analysis/x',
        { a: 1 },
        (s) => ({ a: s.a }),
        () => null,
      ),
    );
    await act(async () => {
      result.current.runAnalysis();
    });
    expect(apiPostJSONMock).toHaveBeenCalledWith(
      '/api/v1/analysis/x',
      { a: 1 },
      expect.any(String),
    );
    expect(result.current.results).toEqual({ r: 7 });
  });
});

describe('useOptimizerLikeState', () => {
  it('应提供默认日期与空结果', () => {
    const { result } = renderHook(() => useOptimizerLikeState<{ x: number }>());
    expect(typeof result.current.startDate).toBe('string');
    expect(typeof result.current.endDate).toBe('string');
    expect(result.current.results).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useDataMeta', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('应通过 apiFetch 拉取数据元信息', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { lastUpdated: '2024-01-01', tickerCount: 2 },
      }),
    });
    const { result } = renderHook(() => useDataMeta());
    await act(async () => {});
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/data/meta', { silent: true });
    expect(result.current).toEqual({ lastUpdated: '2024-01-01', tickerCount: 2 });
  });
});

describe('useChartCalcWorker', () => {
  type WorkerMsg = { data: { id: number; result?: number; error?: string } };
  let worker: {
    posted: { id: number; type: string; payload: unknown[] }[];
    onmessage: ((e: WorkerMsg) => void) | null;
    terminate: ReturnType<typeof vi.fn>;
  };

  class FakeWorker {
    onmessage: ((e: WorkerMsg) => void) | null = null;
    posted: { id: number; type: string; payload: unknown[] }[] = [];
    terminate = vi.fn();
    postMessage(msg: { id: number; type: string; payload: unknown[] }) {
      this.posted.push(msg);
    }
  }

  beforeEach(() => {
    worker = new FakeWorker();
    vi.stubGlobal('Worker', vi.fn(() => worker) as unknown as typeof Worker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('应提交任务、接收结果并忽略过期消息', () => {
    const task = { type: 'rolling', payload: [1, 2] };
    const { result, rerender, unmount } = renderHook(({ t }) => useChartCalcWorker<number>(t), {
      initialProps: { t: task },
    });
    expect(worker.posted).toHaveLength(1);
    expect(result.current.isPending).toBe(true);

    act(() => {
      worker.onmessage?.({ data: { id: 0, result: 42 } });
    });
    expect(result.current.data).toBe(42);
    expect(result.current.isPending).toBe(false);

    act(() => {
      worker.onmessage?.({ data: { id: 99, result: 1 } });
    });
    expect(result.current.data).toBe(42);

    rerender({ t: { type: 'rolling', payload: [1, 2] } });
    expect(worker.posted).toHaveLength(1);

    rerender({ t: { type: 'std', payload: [] } });
    expect(worker.posted).toHaveLength(2);
    act(() => {
      worker.onmessage?.({ data: { id: 1, error: 'boom' } });
    });
    expect(result.current.error).toBe('boom');

    unmount();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('task 为 null 时不提交任务', () => {
    const { result } = renderHook(() => useChartCalcWorker<number>(null));
    expect(result.current.isPending).toBe(false);
  });
});
