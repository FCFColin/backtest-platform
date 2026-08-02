/**
 * WebSocket 实时进度推送服务端（P1-04，ADR-045 多 Pod 广播 + D3-002 共享订阅）。
 * 路径 /api/v1/ws/runs/:jobId；握手鉴权 ?token=<JWT> 或 Sec-WebSocket-Protocol: bearer.<JWT>
 * （浏览器 WebSocket 无法设置自定义 Header）。Worker 将进度 publish 到 Redis channel
 * backtest:progress:{jobId}，本服务端订阅并转发；Redis Pub/Sub 天然支持多 Pod 广播。
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import IORedis from 'ioredis';
import client from 'prom-client';
import { verifyToken } from '../middleware/jwtAuth.js';
import { buildRedisBaseOptions } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { getPrometheusRegister } from '../utils/metrics.js';

const WS_PATH_PREFIX = '/api/v1/ws/runs/';
const CHANNEL_PREFIX = 'backtest:progress:';

/** 活跃 WebSocket 连接数（P1-04 Saturation 指标）。 */
const wsConnectionsActive = new client.Gauge({
  name: 'ws_connections_active',
  help: 'Active WebSocket connections for backtest progress streaming',
  registers: [getPrometheusRegister()],
});

let sharedSubscriber: IORedis | null = null;
let subscriberInitPromise: Promise<IORedis> | null = null;
const channelClients = new Map<string, Set<WebSocket>>();
/** channel 订阅 Promise（防止并发连接同时 subscribe 同一 channel） */
const channelSubscriptions = new Map<string, Promise<void>>();

/** 懒初始化共享 Redis 订阅连接；ioredis 自动重连并重新订阅已注册 channel。 */
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
    logger.info('[ws] 共享 Redis 订阅连接已创建');
    return sub;
  })();
  return subscriberInitPromise;
}

/** 注册连接：首个连接触发 Redis subscribe，后续仅加入内存 Set。subscribe 失败时清理并抛出。 */
async function subscribeChannel(channel: string, ws: WebSocket): Promise<void> {
  const sub = await ensureSharedSubscriber();
  let clients = channelClients.get(channel);
  if (!clients) {
    clients = new Set();
    channelClients.set(channel, clients);
  }
  clients.add(ws);
  if (!channelSubscriptions.has(channel)) {
    const subscribePromise = sub.subscribe(channel).then(() => undefined);
    channelSubscriptions.set(channel, subscribePromise);
    try {
      await subscribePromise;
    } catch (err) {
      channelSubscriptions.delete(channel);
      channelClients.delete(channel);
      throw err;
    }
  } else {
    await channelSubscriptions.get(channel);
  }
}

/** 注销连接：最后一个连接关闭时取消 Redis 订阅释放资源。 */
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

/** 提取 jobId：仅匹配精确前缀 /api/v1/ws/runs/<jobId>，避免误吞其他路径。 */
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

/** 提取 JWT：优先 ?token=，回退 Sec-WebSocket-Protocol: bearer.<JWT>。 */
function extractToken(req: IncomingMessage): string | null {
  const url = req.url || '';
  try {
    const token = new URL(url, 'http://localhost').searchParams.get('token');
    if (token) return token;
  } catch {
    /* URL 解析失败时回退 subprotocol */
  }
  const proto = req.headers['sec-websocket-protocol'];
  if (typeof proto === 'string') {
    for (const part of proto.split(',')) {
      const trimmed = part.trim();
      if (trimmed.startsWith('bearer.')) return trimmed.slice(7);
    }
  }
  return null;
}

function rejectHandshake(socket: Duplex, statusCode: number, reason: string): void {
  if (!socket.destroyed && socket.writable)
    socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function handleConnection(ws: WebSocket, jobId: string, userId: string): void {
  wsConnectionsActive.inc();
  const channel = `${CHANNEL_PREFIX}${jobId}`;
  logger.info({ jobId, userId }, '[ws] 连接已建立，注册到共享订阅');
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    wsConnectionsActive.dec();
    unsubscribeChannel(channel, ws);
  };
  ws.on('close', () => {
    logger.info({ jobId, userId }, '[ws] 连接已关闭，取消 channel 注册');
    cleanup();
  });
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

/**
 * 在已有 HTTP server 上挂载 WS 升级处理（noServer 模式）：仅处理 /api/v1/ws/runs/:jobId，
 * 其他升级请求放行不处理，避免与其他 upgrade 处理器冲突。
 */
export function setupBacktestWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const jobId = extractJobId(req);
    if (jobId === null) return; // 非进度端点：放行
    const token = extractToken(req);
    if (!token) {
      logger.warn({ jobId }, '[ws] 握手缺少 JWT 凭证');
      rejectHandshake(socket, 401, 'Unauthorized');
      return;
    }
    verifyToken(token)
      .then((payload) => {
        if (!payload) {
          logger.warn({ jobId }, '[ws] JWT 验证失败');
          rejectHandshake(socket, 401, 'Unauthorized');
          return;
        }
        if (socket.destroyed) return;
        wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, jobId, payload.sub));
      })
      .catch((err) => {
        logger.warn({ err: String(err), jobId }, '[ws] verifyToken 抛出异常');
        rejectHandshake(socket, 401, 'Unauthorized');
      });
  });
  logger.info('[ws] Backtest WebSocket 服务端已挂载 (/api/v1/ws/runs/:jobId)');
}
