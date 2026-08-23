import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { fetchM, postM, errM, toastM, authStore } = vi.hoisted(() => ({
  fetchM: vi.fn(),
  postM: vi.fn(),
  errM: vi.fn(),
  toastM: vi.fn(),
  authStore: {
    logout: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: () => true,
    org: { id: 'org-1' },
    user: { orgRole: 'admin' },
  },
}));

vi.mock('react-router', () => ({ useNavigate: vi.fn() }));
vi.mock('../../../packages/frontend/src/store/authStore', () => ({
  useAuthStore: (selector: (s: typeof authStore) => unknown) => selector(authStore),
}));
vi.mock('../../../packages/frontend/src/store/toastStore', () => ({
  useToastStore: { getState: () => ({ addToast: toastM }) },
}));
vi.mock('../../../packages/frontend/src/utils/errorReporter', () => ({ reportError: errM }));
vi.mock('../../../packages/frontend/src/utils/apiClient', () => ({
  apiFetch: fetchM,
  apiPostJSON: postM,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

import {
  usePolling,
  useTickerMeta,
  useOrgAuth,
  useSetterState,
  useAssetList,
  useChartAnimation,
  useAdminFetch,
  useComputeTool,
  useAnalysisState,
  useChartCalcWorker,
  useDataMeta,
} from '../../../packages/frontend/src/hooks/miscHooks';

describe('usePolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['enabled=true 时应立即调用并按间隔轮询', { immediate: true }, 1, 2],
    ['immediate=false 时不立即调用', { immediate: false }, 0, 1],
  ])('%s', (_n, opts, initCount, nextCount) => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, opts));
    expect(fn).toHaveBeenCalledTimes(initCount);
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(nextCount);
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
    fetchM.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('空 ticker 时应返回 null', () => {
    const { result } = renderHook(() => useTickerMeta(''));
    expect(result.current).toBeNull();
  });

  it('应延迟请求并返回解包后的 ticker meta', async () => {
    const meta = { ticker: 'AAPL', name: 'Apple', exchange: 'NASDAQ', currency: 'usd' };
    fetchM.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: meta }) });
    const { result } = renderHook(() => useTickerMeta('AAPL'));
    expect(result.current).toBeNull();
    await act(async () => vi.advanceTimersByTime(300));
    expect(result.current).toEqual(meta);
  });

  it.each([
    ['API 失败', { ok: false }],
    ['API 抛异常', null],
  ])('%s 应返回 null', async (_n, mockValue) => {
    if (mockValue === null) fetchM.mockRejectedValue(new Error('network'));
    else fetchM.mockResolvedValue(mockValue);
    const { result } = renderHook(() => useTickerMeta('FAIL'));
    await act(async () => vi.advanceTimersByTime(300));
    expect(result.current).toBeNull();
  });
});

describe('useOrgAuth', () => {
  it('应从 authStore 取鉴权与组织信息', () => {
    const { result } = renderHook(() => useOrgAuth());
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.org).toEqual({ id: 'org-1' });
    expect(result.current.orgRole).toBe('admin');
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
  it('应支持增删改与总权重计算', () => {
    const asset = (t: string, w: number) => ({ ticker: t, weight: w });
    const { result } = renderHook(() => useAssetList([asset('AAPL', 60)], () => asset('BND', 40)));
    expect(result.current.totalWeight).toBe(60);
    act(() => result.current.addAsset());
    expect(result.current.assets).toHaveLength(2);
    act(() => result.current.updateAsset(0, 'weight', 30));
    expect(result.current.totalWeight).toBe(70);
    act(() => result.current.removeAsset(0));
    expect(result.current.assets).toHaveLength(1);
    act(() => result.current.removeAsset(0));
    expect(result.current.assets).toHaveLength(1);
  });
});

describe('useChartAnimation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('大数据集/减动偏好应关闭动画', () => {
    const mq = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mq),
    );
    const { result } = renderHook(() => useChartAnimation(true));
    expect(result.current).toEqual({ isAnimationActive: false });
  });
});

describe('useAdminFetch', () => {
  beforeEach(() => {
    fetchM.mockReset();
    errM.mockReset();
    toastM.mockReset();
  });

  it('成功路径应解析数据', async () => {
    fetchM.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { n: 3 } }) });
    const parser = vi.fn((d: Record<string, unknown>) => ({ count: d.n as number }));
    const { result } = renderHook(() =>
      useAdminFetch<{ count: number }>('/api/v1/admin/x', parser, { count: 0 }, 'TestComp'),
    );
    await act(async () => result.current.fetch());
    expect(result.current.data).toEqual({ count: 3 });
  });

  it('响应非成功时保持初始数据', async () => {
    fetchM.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    const { result } = renderHook(() => useAdminFetch<number>('/u', () => 1, 0, 'C'));
    await act(async () => result.current.fetch());
    expect(result.current.data).toBe(0);
  });

  it('请求异常时报错并弹出 toast', async () => {
    fetchM.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useAdminFetch<number>('/u', () => 1, 0, 'C'));
    await act(async () => result.current.fetch());
    expect(errM).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

describe('useComputeTool', () => {
  it('校验通过时执行计算并写入 results', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useComputeTool(compute, () => null));
    await act(async () => result.current.runCompute());
    expect(result.current.results).toEqual({ ok: true });
  });

  it('校验失败时设置 error', () => {
    const compute = vi.fn();
    const { result } = renderHook(() => useComputeTool(compute, () => 'invalid'));
    act(() => result.current.runCompute());
    expect(compute).not.toHaveBeenCalled();
    expect(result.current.error).toBe('invalid');
  });

  it('reset 应清空 results', async () => {
    const compute = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useComputeTool(compute, () => null));
    await act(async () => result.current.runCompute());
    act(() => result.current.reset());
    expect(result.current.results).toBeNull();
  });
});

describe('useAnalysisState', () => {
  beforeEach(() => postM.mockReset());

  const setup = (v: () => string | null) =>
    renderHook(() =>
      useAnalysisState<{ a: number }, { r: number }>(
        '/api/v1/analysis/x',
        { a: 1 },
        (s) => ({ a: s.a }),
        v,
      ),
    );

  it('校验失败时设置 error', () => {
    const { result } = setup(() => 'bad input');
    act(() => result.current.runAnalysis());
    expect(postM).not.toHaveBeenCalled();
    expect(result.current.error).toBe('bad input');
  });

  it('校验通过时调用 apiPostJSON', async () => {
    postM.mockResolvedValue({ r: 7 });
    const { result } = setup(() => null);
    await act(async () => result.current.runAnalysis());
    expect(result.current.results).toEqual({ r: 7 });
  });
});

describe('useDataMeta', () => {
  beforeEach(() => fetchM.mockReset());

  it('应通过 apiFetch 拉取数据元信息', async () => {
    const meta = { lastUpdated: '2024-01-01', tickerCount: 2 };
    fetchM.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: meta }) });
    const { result } = renderHook(() => useDataMeta());
    await act(async () => {});
    expect(result.current).toEqual(meta);
  });
});

describe('useChartCalcWorker', () => {
  type Msg = { id: number; result?: number; error?: string };
  class FakeWorker {
    onmessage: ((e: { data: Msg }) => void) | null = null;
    posted: { id: number; type: string; payload: unknown[] }[] = [];
    terminate = vi.fn();
    postMessage(msg: { id: number; type: string; payload: unknown[] }) {
      this.posted.push(msg);
    }
  }
  let worker: FakeWorker;

  beforeEach(() => {
    worker = new FakeWorker();
    vi.stubGlobal('Worker', vi.fn(() => worker) as unknown as typeof Worker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('应提交任务、接收结果并忽略过期消息', () => {
    const send = (data: Msg) => act(() => worker.onmessage?.({ data }));
    const task = { type: 'rolling', payload: [1, 2] };
    const { result, rerender, unmount } = renderHook(({ t }) => useChartCalcWorker<number>(t), {
      initialProps: { t: task },
    });
    expect(worker.posted).toHaveLength(1);
    expect(result.current.isPending).toBe(true);
    send({ id: 0, result: 42 });
    expect(result.current.data).toBe(42);
    send({ id: 99, result: 1 });
    expect(result.current.data).toBe(42);
    rerender({ t: { type: 'rolling', payload: [1, 2] } });
    expect(worker.posted).toHaveLength(1);
    rerender({ t: { type: 'std', payload: [] } });
    expect(worker.posted).toHaveLength(2);
    send({ id: 1, error: 'boom' });
    expect(result.current.error).toBe('boom');
    unmount();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('task 为 null 时不提交任务', () => {
    const { result } = renderHook(() => useChartCalcWorker<number>(null));
    expect(result.current.isPending).toBe(false);
  });
});
