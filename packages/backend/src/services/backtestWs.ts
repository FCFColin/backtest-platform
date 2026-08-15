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
    logger.info('[ws] 共享 Redis 订阅连接已创建');
    return sub;
  })();
  return subscriberInitPromise;
}

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
  const channel = `${PROGRESS_CHANNEL_PREFIX}${jobId}`;
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

export function setupBacktestWebSocket(server: Server): WebSocketServer {
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
        wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, jobId, payload.sub));
      })
      .catch((err) => {
        logger.warn({ err: String(err), jobId }, '[ws] verifyToken 抛出异常');
        rejectHandshake(socket, 401, 'Unauthorized');
      });
  });
  logger.info('[ws] Backtest WebSocket 服务端已挂载 (/api/v1/ws/runs/:jobId)');
  return wss;
}
