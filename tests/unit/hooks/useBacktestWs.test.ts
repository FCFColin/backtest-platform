/**
 * @vitest-environment happy-dom
 *
 * P0-01 T4 · WebSocket 重连逻辑单元测试
 *
 * 覆盖 useBacktestWs.ts 的 4 个核心场景：
 *   1. WS 连接成功 → 收到 progress 事件 → 触发 UI 更新
 *   2. WS 连接中断 → 1s 后自动重连（第 1 次）
 *   3. 重连失败 3 次后 → 降级为轮询模式
 *   4. 任务完成事件收到后 → 自动关闭 WS 连接
 *
 * 源文件: tmp.md L154-162
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ===== Mock WebSocket 类 =====

interface MockWsInstance {
  url: string;
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  close: (code?: number, reason?: string) => void;
  send: (data: string) => void;
  /** 测试辅助：模拟服务端触发 open 事件 */
  simulateOpen: () => void;
  /** 测试辅助：模拟服务端发送消息 */
  simulateMessage: (data: string) => void;
  /** 测试辅助：模拟服务端关闭连接 */
  simulateClose: (code: number, reason?: string) => void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

let mockWsInstances: MockWsInstance[] = [];
let mockWsFactory: ((url: string) => MockWsInstance) | null = null;

class MockWebSocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;

  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;

  url: string;
  readyState: number = CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    if (mockWsFactory) {
      const instance = mockWsFactory(url);
      mockWsInstances.push(instance);
      // 代理属性到工厂创建的实例
      Object.assign(this, instance);
    } else {
      mockWsInstances.push(this as unknown as MockWsInstance);
    }
  }

  close(_code = 1000, _reason?: string): void {
    this.readyState = CLOSED;
  }

  send(_data: string): void {
    // no-op
  }
}

function createMockWsInstance(url: string): MockWsInstance {
  const instance: MockWsInstance = {
    url,
    readyState: CONNECTING,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    close(_code = 1000) {
      this.readyState = CLOSED;
    },
    send() {},
    simulateOpen() {
      this.readyState = OPEN;
      this.onopen?.(new Event('open'));
    },
    simulateMessage(data: string) {
      this.onmessage?.({ data } as MessageEvent);
    },
    simulateClose(code: number, _reason?: string) {
      this.readyState = CLOSED;
      this.onclose?.(new CloseEvent('close', { code, reason: _reason }));
    },
  };
  return instance;
}

// ===== Mock 依赖 =====

vi.mock('../../../packages/frontend/src/utils/apiClient.js', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../../packages/frontend/src/utils/authTokens.js', () => ({
  getAccessToken: vi.fn(() => 'mock-jwt-token'),
  refreshTokens: vi.fn().mockResolvedValue(true),
}));

import { useBacktestWs } from '../../../packages/frontend/src/hooks/useBacktestWs.js';
import { apiFetch } from '../../../packages/frontend/src/utils/apiClient.js';

// ===== 测试用例 =====

describe('P0-01 T4 · useBacktestWs WebSocket 重连逻辑', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWsInstances = [];
    mockWsFactory = createMockWsInstance;
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('场景1: WS 连接成功 → 收到 progress 事件 → 触发 UI 更新', async () => {
    const { result } = renderHook(() => useBacktestWs('job-test-001'));

    // 等待 WS 构造
    await waitFor(() => {
      expect(mockWsInstances.length).toBe(1);
    });

    // 模拟 WS 连接成功
    act(() => {
      mockWsInstances[0].simulateOpen();
    });

    expect(result.current.source).toBe('ws');

    // 模拟收到进度消息
    act(() => {
      mockWsInstances[0].simulateMessage(
        JSON.stringify({
          status: 'running',
          progressPct: 50,
        }),
      );
    });

    expect(result.current.progress).not.toBeNull();
    expect(result.current.progress?.status).toBe('running');
    expect(result.current.progress?.progress).toBe(50);
  });

  it('场景2: WS 连接中断 → 1s 后自动重连（第 1 次）', async () => {
    renderHook(() => useBacktestWs('job-reconnect-001', { maxReconnectAttempts: 3 }));

    await waitFor(() => {
      expect(mockWsInstances.length).toBe(1);
    });

    // 模拟连接成功
    act(() => {
      mockWsInstances[0].simulateOpen();
    });

    // 模拟连接中断（非正常关闭）
    act(() => {
      mockWsInstances[0].simulateClose(1006, 'abnormal closure');
    });

    // 此时不应立即重连，应等待 1s（指数退避基础延迟）
    expect(mockWsInstances.length).toBe(1);

    // 快进 1s
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // 应该创建了新的 WS 实例（重连）
    await waitFor(() => {
      expect(mockWsInstances.length).toBe(2);
    });
  });

  it('场景3: 重连失败 3 次后 → 降级为轮询模式', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: 'job-fallback-001',
          status: 'running',
          progress: 10,
        },
      }),
    } as Response);

    const { result } = renderHook(() =>
      useBacktestWs('job-fallback-001', { maxReconnectAttempts: 3 }),
    );

    await waitFor(() => {
      expect(mockWsInstances.length).toBe(1);
    });

    // 模拟 3 次重连失败
    for (let i = 0; i < 3; i++) {
      const currentInstance = mockWsInstances[mockWsInstances.length - 1];
      act(() => {
        currentInstance.simulateOpen();
      });
      act(() => {
        currentInstance.simulateClose(1006);
      });
      // 快进重连延迟（指数退避：1s, 2s, 4s）
      act(() => {
        vi.advanceTimersByTime(1000 * Math.pow(2, i));
      });
      await waitFor(() => {
        expect(mockWsInstances.length).toBe(i + 2);
      });
    }

    // 第 4 次关闭后应降级到轮询（不再创建新 WS）
    const lastWs = mockWsInstances[mockWsInstances.length - 1];
    act(() => {
      lastWs.simulateOpen();
    });
    act(() => {
      lastWs.simulateClose(1006);
    });

    // 快进时间让轮询执行
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // 应该降级到轮询模式
    await waitFor(() => {
      expect(result.current.source).toBe('polling');
    });

    expect(apiFetch).toHaveBeenCalled();
  });

  it('场景4: 任务完成事件收到后 → 自动关闭 WS 连接', async () => {
    const { result } = renderHook(() => useBacktestWs('job-complete-001'));

    await waitFor(() => {
      expect(mockWsInstances.length).toBe(1);
    });

    act(() => {
      mockWsInstances[0].simulateOpen();
    });

    // 模拟收到 completed 消息
    act(() => {
      mockWsInstances[0].simulateMessage(
        JSON.stringify({
          status: 'completed',
          progressPct: 100,
          result: { portfolios: [] },
        }),
      );
    });

    // 验证进度已更新为终态
    expect(result.current.progress?.status).toBe('completed');
    expect(result.current.progress?.progress).toBe(100);

    // WS 应被清理（onclose 设为 null 表示已清理）
    expect(mockWsInstances[0].onclose).toBeNull();
    expect(mockWsInstances[0].onmessage).toBeNull();
    expect(mockWsInstances[0].onopen).toBeNull();
  });
});
