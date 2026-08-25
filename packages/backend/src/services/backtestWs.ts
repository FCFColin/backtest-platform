import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import IORedis from 'ioredis';
import client from 'prom-client';
import { verifyToken } from '../middleware/jwtAuth.js';
import { jobAccessGranted } from '../middleware/jobAccess.js';
import { backtestQueue, PROGRESS_CHANNEL_PREFIX } from '../queues/backtestQueue.js';
import { buildRedisBaseOptions } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { getPrometheusRegister } from '../utils/metrics.js';

const WS_PATH_PREFIX = '/api/v1/ws/runs/';

const wsConnectionsActive = new client.Gauge({
  name: 'ws_connections_active',
  help: 'Active WebSocket connections for backtest progress streaming',
  registers: [getPrometheusRegister()],
});

// ── A2 连接治理：心跳 / 连接上限 / 握手限流 ──────────────────────────────
// 上限与握手速率经环境变量覆盖（延迟读取，便于测试注入）；不依赖 Redis——
// upgrade 不走 express 中间件链，且限流器 fail-closed 语义不应放大到握手路径。
const WS_HEARTBEAT_INTERVAL_MS = 30_000;
const WS_HANDSHAKE_WINDOW_MS = 60_000;

function envPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const maxConnections = (): number => envPositiveInt(process.env.MAX_WS_CLIENTS, 100);
const handshakeRatePerMin = (): number => envPositiveInt(process.env.WS_HANDSHAKE_RATE, 10);

interface WsWithAlive extends WebSocket {
  isAlive?: boolean;
}

let heartbeatTimer: NodeJS.Timeout | null = null;
/** @internal 单测接缝：心跳清扫一轮（ping 存活者，回收两轮无 pong 的半开连接） */
export function __heartbeatSweep(clients: Iterable<WebSocket>): void {
  for (const ws of clients) {
    const ext = ws as WsWithAlive;
    if (ext.isAlive === false) {
      // 半开 TCP：上一轮 ping 无 pong，直接回收（close 事件触发 gauge/cleanup）
      ext.terminate();
      continue;
    }
    ext.isAlive = false;
    ws.ping();
  }
}
function startHeartbeat(wss: WebSocketServer): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => __heartbeatSweep(wss.clients), WS_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
}

const handshakeHits = new Map<string, { count: number; windowStart: number }>();
function handshakeAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = handshakeHits.get(ip);
  if (!entry || now - entry.windowStart >= WS_HANDSHAKE_WINDOW_MS) {
    if (handshakeHits.size > 10_000) handshakeHits.clear(); // 防 Map 无界膨胀
    handshakeHits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= handshakeRatePerMin();
}
/** @internal 单测接缝：upgrade 守卫链（连接上限→握手限流），返回应拒绝的 HTTP 状态码或 null */
export function __upgradeGuardRejects(currentSize: number, ip: string): number | null {
  if (currentSize >= maxConnections()) return 503;
  if (!handshakeAllowed(ip)) return 429;
  return null;
}
/** @internal 单测接缝：订阅注册（含关闭竞态守卫）；已关闭连接拒绝入册 */
export function __registerChannelClient(channel: string, ws: WebSocket): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  let clients = channelClients.get(channel);
  if (!clients) {
    clients = new Set();
    channelClients.set(channel, clients);
  }
  clients.add(ws);
  return true;
}

let sharedSubscriber: IORedis | null = null;
let subscriberInitPromise: Promise<IORedis> | null = null;
const channelClients = new Map<string, Set<WebSocket>>();
const channelSubscriptions = new Map<string, Promise<void>>();

async function ensureSharedSubscriber(): Promise<IORedis> {
  if (sharedSubscriber) return sharedSubscriber;
  if (subscriberInitPromise) return subscriberInitPromise;
  subscriberInitPromise = (async () => {
    const sub = new IORedis({
      ...buildRedisBaseOptions(),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    sub.on('error', (err) => logger.warn({ err: String(err) }, '[ws] 共享 Redis 订阅连接错误'));
    sub.on('message', (channel, message) => {
      const clients = channelClients.get(channel);
      if (!clients || clients.size === 0) return;
      for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(message);
    });
    sharedSubscriber = sub;
    return sub;
  })();
  return subscriberInitPromise;
}

async function subscribeChannel(channel: string, ws: WebSocket): Promise<void> {
  const sub = await ensureSharedSubscriber();
  // 竞态收口（A2）：等待共享订阅连接期间连接已关闭则不得入 set，
  // 否则 cleanup 已先行跑空、该僵尸条目永不被清理
  const registered = __registerChannelClient(channel, ws);
  if (!registered) return;
  const clients = channelClients.get(channel)!;
  if (!channelSubscriptions.has(channel)) {
    const subscribePromise = sub.subscribe(channel).then(() => undefined);
    channelSubscriptions.set(channel, subscribePromise);
    try {
      await subscribePromise;
    } catch (err) {
      channelSubscriptions.delete(channel);
      clients.delete(ws); // 只摘除本连接，避免误删同 channel 其他客户端订阅
      throw err;
    }
  } else {
    await channelSubscriptions.get(channel);
  }
}

function unsubscribeChannel(channel: string, ws: WebSocket): void {
  const clients = channelClients.get(channel);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) {
    channelClients.delete(channel);
    channelSubscriptions.delete(channel);
    if (sharedSubscriber) sharedSubscriber.unsubscribe(channel).catch(() => undefined);
  }
}

function extractJobId(req: IncomingMessage): string | null {
  const url = req.url || '';
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    pathname = url.split('?')[0];
  }
  if (!pathname.startsWith(WS_PATH_PREFIX)) return null;
  const jobId = pathname.slice(WS_PATH_PREFIX.length).split('/')[0];
  return jobId.length > 0 ? jobId : null;
}

// 仅接受 sec-websocket-protocol 通道传凭证，query token 会落入代理与访问日志（泄密面）
function extractToken(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (typeof proto !== 'string') return null;
  for (const part of proto.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('bearer.')) return trimmed.slice(7);
  }
  return null;
}

function rejectHandshake(socket: Duplex, statusCode: number, reason: string): void {
  if (!socket.destroyed && socket.writable)
    socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function handleConnection(ws: WebSocket, jobId: string, _userId: string): void {
  wsConnectionsActive.inc();
  const channel = `${PROGRESS_CHANNEL_PREFIX}${jobId}`;
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    wsConnectionsActive.dec();
    unsubscribeChannel(channel, ws);
  };
  ws.on('close', cleanup);
  ws.on('error', (err) => {
    logger.warn({ err: String(err), jobId }, '[ws] 连接异常');
    cleanup();
  });
  subscribeChannel(channel, ws)
    .then(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'connected', jobId, channel }));
    })
    .catch((err) => {
      logger.warn({ err: String(err), jobId }, '[ws] Redis subscribe 失败');
      ws.close(1011, 'Subscription failed');
      cleanup();
    });
}

export function setupBacktestWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const jobId = extractJobId(req);
    if (jobId === null) return;
    // A2 守卫链（上限→限流）：先于认证做最廉价拒绝；upgrade 不经 express 中间件链，须就地设防
    const guardReject = __upgradeGuardRejects(
      wss.clients.size,
      req.socket.remoteAddress ?? 'unknown',
    );
    if (guardReject === 503) {
      logger.warn({ jobId }, '[ws] 连接数已达上限，拒绝握手');
      rejectHandshake(socket, 503, 'Service Unavailable');
      return;
    }
    if (guardReject === 429) {
      logger.warn({ jobId }, '[ws] 握手速率超限');
      rejectHandshake(socket, 429, 'Too Many Requests');
      return;
    }
    const token = extractToken(req);
    if (!token) {
      logger.warn({ jobId }, '[ws] 握手缺少 JWT 凭证');
      rejectHandshake(socket, 401, 'Unauthorized');
      return;
    }
    verifyToken(token)
      .then(async (payload) => {
        if (!payload) {
          logger.warn({ jobId }, '[ws] JWT 验证失败');
          rejectHandshake(socket, 401, 'Unauthorized');
          return;
        }
        if (socket.destroyed) return;
        // ADR-007 IDOR 防护：仅任务所有者/同租户可订阅进度（与 /runs/:jobId 同判定）
        const job = await backtestQueue.getJob(jobId);
        if (!job || !jobAccessGranted(job, payload, payload.tenant_id)) {
          logger.warn({ jobId, userId: payload.sub }, '[ws] 越权订阅被拒绝');
          rejectHandshake(socket, 403, 'Forbidden');
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          // A2 心跳接线：pong 刷新存活位；30s 周期扫描由 startHeartbeat 驱动
          const ext = ws as WsWithAlive;
          ext.isAlive = true;
          const markAlive = (): void => {
            ext.isAlive = true;
          };
          ws.on('pong', markAlive);
          handleConnection(ws, jobId, payload.sub);
        });
      })
      .catch((err) => {
        logger.warn({ err: String(err), jobId }, '[ws] 握手内部服务异常');
        rejectHandshake(socket, 503, 'Service Unavailable');
      });
  });
  startHeartbeat(wss);
  return wss;
}

/** @internal 测试专用：观测 channel→clients 注册表规模（竞态收口断言用） */
export function __channelClientCount(channel: string): number {
  return channelClients.get(channel)?.size ?? 0;
}

/** @internal 测试专用：跨用例隔离（清空订阅注册表与握手限流窗口） */
export function __resetWsInternals(): void {
  channelClients.clear();
  channelSubscriptions.clear();
  handshakeHits.clear();
}
