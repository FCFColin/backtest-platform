/**
 * WebSocket 实时进度推送服务端（P1-04）。
 *
 * 设计要点（ADR-045 多 Pod 广播 + D3-002 共享订阅）：
 * - 路径：/api/v1/ws/runs/:jobId
 * - 握手鉴权：query 参数 ?token=<JWT> 或 Sec-WebSocket-Protocol: bearer.<JWT>
 *   （浏览器 WebSocket API 无法设置自定义 Header，故走 query/subprotocol）
 * - 进度来源：Worker 进程将 BullMQ progress/completed/failed 事件 publish 到
 *   Redis channel backtest:progress:{jobId}，本服务端订阅 channel 并转发给客户端。
 *   Redis Pub/Sub 天然支持多订阅者——每个 Pod 的 WS 服务端各自订阅同一 channel，
 *   客户端连到任意 Pod 都能收到进度（多 Pod 广播）。
 * - 共享订阅（D3-002）：单个进程维护一个共享 Redis 订阅连接，通过
 *   Map<channel, Set<WebSocket>> 在内存中路由消息到对应客户端，避免每连接独占
 *   Redis 订阅。同一 channel 的多个连接复用一个 Redis subscription，大幅减少连接数。
 *
 * 安全：
 * - 握手必须验证 JWT（复用 verifyToken，含 alg:none 防护与吊销检查），失败返回 401
 * - jobId 仅用于 channel 名拼接，不直接信任为业务凭证；权限校验仍由 HTTP 路由层负责
 * - Prometheus 指标 ws_connections_active 监控活跃连接数（Saturation 信号）
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

// D3-002：共享 Redis 订阅 + 内存路由
// 原设计：每个 WS 连接创建独立的 ioredis 订阅连接，N 个连接 = N 个 Redis connection。
// 问题：高并发场景下 Redis 连接数线性增长，浪费资源。
// 优化：进程级单例 subscriber，通过 Map<channel, Set<WebSocket>> 路由消息到对应客户端。
// 同一 channel 的多个连接复用一个 Redis subscription，连接数从 O(N) 降至 O(1)+O(channels)。

let sharedSubscriber: IORedis | null = null;
let subscriberInitPromise: Promise<IORedis> | null = null;

const channelClients = new Map<string, Set<WebSocket>>();

/** channel 订阅操作的 Promise（防止并发连接同时 subscribe 同一 channel） */
const channelSubscriptions = new Map<string, Promise<void>>();

/**
 * 获取或初始化共享 Redis 订阅连接。
 *
 * 使用懒初始化：首次调用时创建，后续复用。ioredis 自动重连并重新订阅已注册的 channel。
 * @returns 共享 ioredis 订阅连接
 */
async function ensureSharedSubscriber(): Promise<IORedis> {
  if (sharedSubscriber) return sharedSubscriber;
  if (subscriberInitPromise) return subscriberInitPromise;

  subscriberInitPromise = (async () => {
    const sub = new IORedis({
      ...buildRedisBaseOptions(),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    sub.on('error', (err) => {
      logger.warn({ err: String(err) }, '[ws] 共享 Redis 订阅连接错误');
    });

    sub.on('message', (channel, message) => {
      const clients = channelClients.get(channel);
      if (!clients || clients.size === 0) return;
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    });

    sharedSubscriber = sub;
    logger.info('[ws] 共享 Redis 订阅连接已创建');
    return sub;
  })();

  return subscriberInitPromise;
}

/**
 * 将 WebSocket 连接注册到共享订阅：加入内存路由表，必要时订阅 Redis channel。
 *
 * 同一 channel 的首个连接触发 Redis subscribe；后续连接仅加入内存 Set。
 * @param channel - Redis channel 名称
 * @param ws - WebSocket 连接实例
 * @throws 当 Redis subscribe 失败时抛出错误
 */
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

/**
 * 将 WebSocket 连接从共享订阅注销：从内存路由表移除，必要时取消 Redis 订阅。
 *
 * 当 channel 的最后一个连接关闭时，取消 Redis subscribe 释放资源。
 * @param channel - Redis channel 名称
 * @param ws - WebSocket 连接实例
 */
function unsubscribeChannel(channel: string, ws: WebSocket): void {
  const clients = channelClients.get(channel);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) {
    channelClients.delete(channel);
    channelSubscriptions.delete(channel);
    if (sharedSubscriber) {
      sharedSubscriber.unsubscribe(channel).catch(() => undefined);
    }
  }
}

/**
 * 从握手请求中提取 jobId。
 *
 * 路径形如 /api/v1/ws/runs/<jobId>（可能带 ?query）。仅匹配精确前缀，避免误吞其他路径。
 */
function extractJobId(req: IncomingMessage): string | null {
  const url = req.url || '';
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    pathname = url.split('?')[0];
  }
  if (!pathname.startsWith(WS_PATH_PREFIX)) return null;
  const rest = pathname.slice(WS_PATH_PREFIX.length);
  const jobId = rest.split('/')[0];
  return jobId.length > 0 ? jobId : null;
}

/**
 * 从握手请求中提取 JWT。
 *
 * 优先级：
 * 1. query 参数 ?token=<JWT>（最通用，浏览器/Node 均可）
 * 2. Sec-WebSocket-Protocol: bearer.<JWT>（浏览器无法设置自定义 Header 时的常用变体）
 */
function extractToken(req: IncomingMessage): string | null {
  const url = req.url || '';
  try {
    const token = new URL(url, 'http://localhost').searchParams.get('token');
    if (token) return token;
  } catch {
    // URL 解析失败时回退 subprotocol
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
  if (!socket.destroyed && socket.writable) {
    socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  }
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
      // 推送一次握手确认，便于客户端识别连接就绪（非进度消息，type=connected 区分）
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'connected', jobId, channel }));
      }
    })
    .catch((err) => {
      logger.warn({ err: String(err), jobId }, '[ws] Redis subscribe 失败');
      ws.close(1011, 'Subscription failed');
      cleanup();
    });
}

/**
 * 在已有 HTTP server 上挂载 WebSocket 升级处理。
 *
 * 使用 noServer 模式手动过滤路径，仅处理 /api/v1/ws/runs/:jobId；
 * 其他升级请求放行（不处理），避免与其他潜在 upgrade 处理器冲突。
 *
 * @param server - 由 createServer(app) 创建的 HTTP server（server.ts 传入）
 */
export function setupBacktestWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const jobId = extractJobId(req);
    if (jobId === null) {
      // 非进度端点：放行，交给其他处理器或超时
      return;
    }
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
        wss.handleUpgrade(req, socket, head, (ws) => {
          handleConnection(ws, jobId, payload.sub);
        });
      })
      .catch((err) => {
        logger.warn({ err: String(err), jobId }, '[ws] verifyToken 抛出异常');
        rejectHandshake(socket, 401, 'Unauthorized');
      });
  });

  logger.info('[ws] Backtest WebSocket 服务端已挂载 (/api/v1/ws/runs/:jobId)');
}