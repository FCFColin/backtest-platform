/**
 * 回测任务实时进度 hook（P1-04 前端客户端）。
 *
 * 设计要点：
 * - 优先使用 WebSocket 接收实时进度（/api/v1/ws/runs/:jobId?token=<JWT>）
 * - WS 连接失败时按指数退避重连（最多 3 次，1s → 2s → 4s，上限 30s）
 * - 重连耗尽后降级到 HTTP 轮询 GET /api/v1/backtest/runs/:jobId
 * - 轮询亦采用指数退避（1s 起步，上限 30s），与 P0-03 轮询模式一致
 * - 任务进入终态（completed/failed）后停止 WS 与轮询
 * - 浏览器 WebSocket API 无法设置自定义 Header，故 JWT 通过 query 参数传递
 *
 * 消息格式（服务端 → 客户端）：
 * - 握手就绪：{ type: 'connected', jobId, channel }
 * - 进度推送：{ jobId, status: 'running'|'completed'|'failed', progressPct, result?, error? }
 *
 * 轮询响应字段为 `progress`（0-100），WS 推送字段为 `progressPct`，内部统一映射为 `progress`。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../utils/apiClient.js';
import { getAccessToken, refreshTokens } from '../utils/authTokens.js';
import { reportError } from '../utils/errorReporter.js';

export type BacktestRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BacktestRunProgress {
  jobId: string;
  status: BacktestRunStatus;
  /** 进度百分比 0-100 */
  progress: number;
  /** 完成时的结果数据（status=completed 时存在） */
  result?: Record<string, unknown>;
  /** 失败时的错误消息（status=failed 时存在） */
  error?: string;
}

/** 当前进度来源，便于 UI 区分实时/轮询模式 */
export type ProgressSource = 'ws' | 'polling' | 'none';

export interface UseBacktestWsOptions {
  /** 是否启用订阅，默认 true */
  enabled?: boolean;
  /** WS 最大重连次数（超过后降级到轮询），默认 3 */
  maxReconnectAttempts?: number;
  /** 轮询初始间隔（毫秒），默认 1000 */
  pollingIntervalMs?: number;
  /** 轮询最大间隔（毫秒），默认 30000 */
  pollingMaxIntervalMs?: number;
}

export interface UseBacktestWsResult {
  /** 最新进度状态，连接前为 null */
  progress: BacktestRunProgress | null;
  /** 当前进度来源 */
  source: ProgressSource;
  /** 手动触发重新连接（重置重连计数并切回 WS 模式） */
  reconnect: () => void;
}

const WS_PATH = '/api/v1/ws/runs/';
const POLL_PATH = '/api/v1/backtest/runs/';
const MAX_RECONNECT_DEFAULT = 3;
const POLL_INTERVAL_DEFAULT = 1000;
const POLL_MAX_INTERVAL_DEFAULT = 30000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
/** 终态集合，进入终态后停止订阅 */
const TERMINAL_STATUSES: ReadonlySet<BacktestRunStatus> = new Set(['completed', 'failed']);

/** 构造 WebSocket URL，附带 JWT query 参数（浏览器 WS API 无法设置自定义 Header） */
function buildWsUrl(jobId: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${window.location.host}${WS_PATH}${jobId}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/** 指数退避延迟（基础延迟 × 2^attempt，上限 maxDelay） */
function exponentialDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/** 解析 WS 消息为进度对象；握手就绪/非进度消息返回 null */
function parseWsMessage(raw: unknown, jobId: string): BacktestRunProgress | null {
  if (typeof raw !== 'string') return null;
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  // 握手就绪消息 { type: 'connected' } 不携带进度，跳过
  if (msg.type === 'connected') return null;
  const status = msg.status as BacktestRunStatus | undefined;
  if (!status) return null;
  return {
    jobId,
    status,
    progress:
      typeof msg.progressPct === 'number'
        ? msg.progressPct
        : typeof msg.progress === 'number'
          ? msg.progress
          : 0,
    result: msg.result as Record<string, unknown> | undefined,
    error: typeof msg.error === 'string' ? msg.error : undefined,
  };
}

/** 解析轮询响应 JSON 为进度对象 */
function parsePollingData(json: unknown, jobId: string): BacktestRunProgress | null {
  const data = (json as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data.status !== 'string') return null;
  return {
    jobId,
    status: data.status as BacktestRunStatus,
    progress: typeof data.progress === 'number' ? data.progress : 0,
    result: data.result as Record<string, unknown> | undefined,
    error: typeof data.error === 'string' ? (data.error as string) : undefined,
  };
}

/** WS 事件绑定参数 */
interface WireWsHandlersArgs {
  ws: WebSocket;
  id: string;
  maxReconnectAttempts: number;
  wsRef: { current: WebSocket | null };
  reconnectAttemptsRef: { current: number };
  reconnectTimerRef: { current: ReturnType<typeof setTimeout> | null };
  mountedRef: { current: boolean };
  onOpen: () => void;
  onProgress: (data: BacktestRunProgress) => void;
  reconnect: (id: string) => void;
  fallback: (id: string) => void;
  refreshTokens: () => Promise<boolean>;
}

/** 绑定 WS onopen/onmessage/onerror/onclose 四个事件处理器 */
function wireWsHandlers(args: WireWsHandlersArgs): void {
  const { ws, id, onOpen, onProgress } = args;
  ws.onopen = () => {
    if (!args.mountedRef.current) return;
    args.reconnectAttemptsRef.current = 0;
    onOpen();
  };
  ws.onmessage = (event: MessageEvent) => {
    if (!args.mountedRef.current) return;
    const data = parseWsMessage(event.data, id);
    if (data) onProgress(data);
  };
  ws.onerror = () => {
    // 错误事件本身不触发重连，由 onclose 统一处理
    reportError(new Error('WebSocket error'), {
      component: 'useBacktestWs',
      action: 'ws.onerror',
      jobId: id,
    });
  };
  ws.onclose = (event: CloseEvent) => {
    if (!args.mountedRef.current) return;
    args.wsRef.current = null;
    handleWsClose({
      event,
      id,
      maxReconnectAttempts: args.maxReconnectAttempts,
      reconnectAttemptsRef: args.reconnectAttemptsRef,
      reconnectTimerRef: args.reconnectTimerRef,
      mountedRef: args.mountedRef,
      reconnect: args.reconnect,
      fallback: args.fallback,
      refreshTokens: args.refreshTokens,
    });
  };
}

/** WS onclose 事件处理参数 */
interface WsCloseHandlerArgs {
  event: CloseEvent;
  id: string;
  maxReconnectAttempts: number;
  reconnectAttemptsRef: { current: number };
  reconnectTimerRef: { current: ReturnType<typeof setTimeout> | null };
  mountedRef: { current: boolean };
  /** 重连自身（递归调用 connectWs） */
  reconnect: (id: string) => void;
  /** 降级到轮询 */
  fallback: (id: string) => void;
  /** 刷新 token 后调用 */
  refreshTokens: () => Promise<boolean>;
}

/** 处理 WS close 事件：1000 正常关闭不重连；4401 刷新 token 重连一次；其他按指数退避重连，超限降级 */
function handleWsClose(args: WsCloseHandlerArgs): void {
  const {
    event,
    id,
    reconnectAttemptsRef,
    reconnectTimerRef,
    mountedRef,
    reconnect,
    fallback,
    refreshTokens,
  } = args;
  if (!mountedRef.current) return;
  if (event.code === 1000) return;
  // 401 鉴权失败：尝试刷新 token 后重连一次
  if (event.code === 4401) {
    void refreshTokens().then((ok) => {
      if (ok && mountedRef.current) {
        reconnectAttemptsRef.current = 0;
        reconnect(id);
      } else if (mountedRef.current) {
        fallback(id);
      }
    });
    return;
  }
  // 指数退避重连，超过上限降级到轮询
  if (reconnectAttemptsRef.current >= args.maxReconnectAttempts) {
    fallback(id);
    return;
  }
  const attempt = reconnectAttemptsRef.current;
  reconnectAttemptsRef.current += 1;
  const delay = exponentialDelay(attempt, RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS);
  reconnectTimerRef.current = setTimeout(() => {
    if (mountedRef.current) reconnect(id);
  }, delay);
}

/**
 * 订阅回测任务实时进度：WS 优先 + 轮询降级。
 *
 * @param jobId - 任务 ID，为空时不订阅
 * @param options - 可选配置
 */
// eslint-disable-next-line max-lines-per-function -- WS 生命周期 Hook：7 个相互依赖的 useCallback + 2 个 useEffect 共同管理 WS 连接/重连/轮询降级/终态清理；进一步机械拆分会将 refs 穿透多个子 hook，损害可读性。解析/重连/事件绑定逻辑已抽取为 parseWsMessage/parsePollingData/handleWsClose/wireWsHandlers 等独立 helper。
export function useBacktestWs(
  jobId: string | null | undefined,
  options: UseBacktestWsOptions = {},
): UseBacktestWsResult {
  const {
    enabled = true,
    maxReconnectAttempts = MAX_RECONNECT_DEFAULT,
    pollingIntervalMs = POLL_INTERVAL_DEFAULT,
    pollingMaxIntervalMs = POLL_MAX_INTERVAL_DEFAULT,
  } = options;

  const [progress, setProgress] = useState<BacktestRunProgress | null>(null);
  const [source, setSource] = useState<ProgressSource>('none');

  // 使用 ref 避免 WS 事件处理器闭包捕获过期状态
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef(pollingIntervalMs);
  const mountedRef = useRef(true);

  /** 清理 WS 连接与重连定时器 */
  const cleanupWs = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      // 移除监听器避免 close 事件触发重连
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'cleanup');
      }
      wsRef.current = null;
    }
  }, []);

  /** 清理轮询定时器 */
  const cleanupPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    pollingIntervalRef.current = pollingIntervalMs;
  }, [pollingIntervalMs]);

  /** 处理进度消息（WS 与轮询统一入口） */
  const applyProgress = useCallback(
    (data: BacktestRunProgress, src: ProgressSource) => {
      if (!mountedRef.current) return;
      setSource(src);
      setProgress(data);
      // 进入终态后停止所有订阅
      if (TERMINAL_STATUSES.has(data.status)) {
        cleanupWs();
        cleanupPolling();
      }
    },
    [cleanupWs, cleanupPolling],
  );

  /** 执行一次轮询查询 */
  const pollOnce = useCallback(
    async (id: string): Promise<void> => {
      if (!mountedRef.current) return;
      try {
        const res = await apiFetch(`${POLL_PATH}${id}`, { silent: true });
        if (!res.ok) return;
        const json = await res.json();
        const data = parsePollingData(json, id);
        if (!data) return;
        applyProgress(data, 'polling');
        if (!mountedRef.current || TERMINAL_STATUSES.has(data.status)) return;
        // 指数退避：每次 ×2，上限 pollingMaxIntervalMs
        const next = Math.min(pollingIntervalRef.current * 2, pollingMaxIntervalMs);
        pollingIntervalRef.current = next;
        pollingTimerRef.current = setTimeout(() => void pollOnce(id), next);
      } catch (err) {
        // 网络错误时保持当前间隔重试，不切换模式
        reportError(err, {
          component: 'useBacktestWs',
          action: 'polling-fallback',
          jobId: id,
        });
        if (!mountedRef.current) return;
        pollingTimerRef.current = setTimeout(() => void pollOnce(id), pollingIntervalRef.current);
      }
    },
    [applyProgress, pollingMaxIntervalMs],
  );

  /** 启动轮询降级模式 */
  const startPolling = useCallback(
    (id: string) => {
      cleanupWs();
      if (!mountedRef.current) return;
      setSource('polling');
      pollingIntervalRef.current = pollingIntervalMs;
      void pollOnce(id);
    },
    [cleanupWs, pollOnce, pollingIntervalMs],
  );

  /** 建立 WebSocket 连接（带指数退避重连） */
  const connectWs = useCallback(
    (id: string) => {
      if (!mountedRef.current) return;
      const token = getAccessToken();
      if (!token) {
        // 无 JWT 凭证，直接降级到轮询（匿名访问由后端 optionalJwtAuth 处理）
        startPolling(id);
        return;
      }
      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl(id, token));
      } catch {
        // WebSocket 构造失败（如 URL 无效），降级到轮询
        startPolling(id);
        return;
      }
      wsRef.current = ws;
      wireWsHandlers({
        ws,
        id,
        maxReconnectAttempts,
        wsRef,
        reconnectAttemptsRef,
        reconnectTimerRef,
        mountedRef,
        onOpen: () => setSource('ws'),
        onProgress: (data) => applyProgress(data, 'ws'),
        reconnect: connectWs,
        fallback: startPolling,
        refreshTokens,
      });
    },
    [applyProgress, maxReconnectAttempts, startPolling],
  );

  /** 手动重连：重置状态并切回 WS 模式 */
  const reconnect = useCallback(() => {
    if (!jobId) return;
    cleanupWs();
    cleanupPolling();
    reconnectAttemptsRef.current = 0;
    pollingIntervalRef.current = pollingIntervalMs;
    setSource('none');
    connectWs(jobId);
  }, [jobId, cleanupWs, cleanupPolling, pollingIntervalMs, connectWs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupWs();
      cleanupPolling();
    };
  }, [cleanupWs, cleanupPolling]);

  useEffect(() => {
    if (!enabled || !jobId) {
      cleanupWs();
      cleanupPolling();
      setProgress(null);
      setSource('none');
      return;
    }
    // 重置状态并启动 WS 订阅
    reconnectAttemptsRef.current = 0;
    pollingIntervalRef.current = pollingIntervalMs;
    setProgress(null);
    setSource('none');
    connectWs(jobId);

    return () => {
      cleanupWs();
      cleanupPolling();
    };
  }, [jobId, enabled, connectWs, cleanupWs, cleanupPolling, pollingIntervalMs]);

  return { progress, source, reconnect };
}
