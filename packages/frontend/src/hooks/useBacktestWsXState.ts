/**
 * XState 状态机 PoC — useBacktestWs 的状态机重写（P4-2 PoC）
 *
 * 这是 PoC 代码，不用于生产。展示用 XState 状态机管理 WS 生命周期的结构。
 * 实际使用需安装 xstate 和 @xstate/react 依赖：
 *   pnpm add xstate @xstate/react
 *
 * 对比原 useBacktestWs（420 行，7 个 useCallback + 2 个 useEffect）：
 * - 状态定义集中（machine.states + transitions）
 * - 纯状态机可单元测试（不依赖 React 渲染）
 * - 状态转换路径可视化（XState Visualizer）
 *
 * 当前生产路径：useBacktestWs.ts（原生 React Hooks）
 */

// NOTE: This file is a PoC stub. Uncomment after installing dependencies:
//   pnpm add xstate @xstate/react

/*
import { useMachine } from '@xstate/react';
import { createMachine, assign, type ActorRef } from 'xstate';
import { useCallback } from 'react';
import { apiFetch } from '../utils/apiClient.js';
import { getAccessToken, refreshTokens } from '../utils/authTokens.js';
import { reportError } from '../utils/errorReporter.js';

// --- 状态机定义 ---

interface ProgressData {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: Record<string, unknown>;
  error?: string;
}

interface WsContext {
  jobId: string;
  ws: WebSocket | null;
  reconnectAttempts: number;
  pollingTimer: ReturnType<typeof setTimeout> | null;
  progress: ProgressData | null;
  source: 'ws' | 'polling' | 'none';
}

type WsEvent =
  | { type: 'CONNECT' }
  | { type: 'WS_OPEN' }
  | { type: 'WS_MESSAGE'; data: ProgressData }
  | { type: 'WS_ERROR' }
  | { type: 'WS_CLOSE'; code: number }
  | { type: 'PROGRESS'; data: ProgressData; source: 'ws' | 'polling' }
  | { type: 'TERMINAL' }
  | { type: 'RECONNECT' }
  | { type: 'FALLBACK_POLLING' }
  | { type: 'DISCONNECT' };

const MAX_RECONNECT = 3;
const POLL_INTERVAL = 1000;
const POLL_MAX = 30000;

const wsMachine = createMachine<WsContext, WsEvent>({
  id: 'backtestWs',
  initial: 'idle',
  context: {
    jobId: '',
    ws: null,
    reconnectAttempts: 0,
    pollingTimer: null,
    progress: null,
    source: 'none',
  },
  states: {
    idle: {
      on: { CONNECT: 'connecting' },
    },
    connecting: {
      entry: 'createWs',
      on: {
        WS_OPEN: 'connected',
        WS_ERROR: 'error',
        WS_CLOSE: { target: 'reconnecting', cond: 'canReconnect' },
      },
    },
    connected: {
      on: {
        WS_MESSAGE: { target: 'connected', actions: 'updateProgress' },
        PROGRESS: { target: 'connected', actions: 'updateProgress' },
        TERMINAL: 'terminal',
        WS_CLOSE: { target: 'reconnecting', cond: 'canReconnect' },
        WS_CLOSE: { target: 'polling', cond: 'cannotReconnect' },
        DISCONNECT: 'disconnected',
      },
    },
    reconnecting: {
      entry: assign({ reconnectAttempts: (ctx) => ctx.reconnectAttempts + 1 }),
      after: {
        1000: 'connecting',
      },
      on: { CONNECT: 'connecting' },
    },
    polling: {
      entry: 'startPolling',
      exit: 'stopPolling',
      on: {
        PROGRESS: { target: 'polling', actions: 'updateProgress' },
        TERMINAL: 'terminal',
        DISCONNECT: 'disconnected',
      },
    },
    error: {
      on: { FALLBACK_POLLING: 'polling' },
    },
    terminal: {
      type: 'final',
    },
    disconnected: {
      type: 'final',
    },
  },
});

// --- React Hook ---

export function useBacktestWsXState(jobId: string | null | undefined) {
  const [state, send] = useMachine(wsMachine, {
    actions: {
      createWs: (ctx) => {
        if (!jobId) return;
        const token = getAccessToken();
        if (!token) {
          send('FALLBACK_POLLING');
          return;
        }
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${window.location.host}/api/v1/ws/runs/${jobId}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        ws.onopen = () => send('WS_OPEN');
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'connected') return;
            send({ type: 'WS_MESSAGE', data: msg as ProgressData });
          } catch { // invalid message
          }
        };
        ws.onerror = () => reportError(new Error('WS error'), { component: 'useBacktestWsXState' });
        ws.onclose = (e) => send({ type: 'WS_CLOSE', code: e.code });
      },
      updateProgress: assign({
        progress: (_ctx, event) => 'data' in event ? event.data : null,
        source: (_ctx, event) => 'source' in event ? event.source : 'ws',
      }),
    },
  });

  // Auto-connect on jobId change
  // useEffect(() => {
  //   if (jobId) send('CONNECT');
  //   else send('DISCONNECT');
  // }, [jobId]);

  return {
    progress: state.context.progress,
    source: state.context.source,
    reconnect: () => send('RECONNECT'),
  };
}
*/
