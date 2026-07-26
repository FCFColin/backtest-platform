/**
 * WebSocket 实时进度推送服务端（P1-04）。
 *
 * 设计要点（ADR-045 多 Pod 广播）：
 * - 路径：/api/v1/ws/runs/:jobId
 * - 握手鉴权：query 参数 ?token=<JWT> 或 Sec-WebSocket-Protocol: bearer.<JWT>
 *   （浏览器 WebSocket API 无法设置自定义 Header，故走 query/subprotocol）
 * - 进度来源：Worker 进程将 BullMQ progress/completed/failed 事件 publish 到
 *   Redis channel `backtest:progress:{jobId}`，本服务端订阅 channel 并转发给客户端。
 *   Redis Pub/Sub 天然支持多订阅者——每个 Pod 的 WS 服务端各自订阅同一 channel，
 *   客户端连到任意 Pod 都能收到进度（多 Pod 广播）。
 * - 连接隔离：每个 WS 连接创建独立的 ioredis 订阅连接（subscribe 模式下同一连接
 *   无法执行其他命令），连接关闭时 quit 释放，避免连接泄漏。
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

/** 写入 HTTP 错误响应并关闭 socket（握手阶段拒绝）。 */
function rejectHandshake(socket: Duplex, statusCode: number, reason: string): void {
  if (!socket.destroyed && socket.writable) {
    socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  }
  socket.destroy();
}

/**
 * 处理单个 WS 连接的生命周期：订阅 Redis channel → 转发消息 → 关闭时清理。
 *
 * 每个连接独占一个 ioredis 订阅连接。subscribe 模式下同一连接不能发其他命令，
 * 故无法复用 appRedis（应用层连接需保留 publish/ping 能力）。
 */
function handleConnection(ws: WebSocket, jobId: string, userId: string): void {
  wsConnectionsActive.inc();
  const channel = `${CHANNEL_PREFIX}${jobId}`;
  logger.info({ jobId, userId }, '[ws] 连接已建立，订阅 Redis channel');

  const subscriber = new IORedis({
    ...buildRedisBaseOptions(),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    wsConnectionsActive.dec();
    subscriber.unsubscribe(channel).catch(() => undefined);
    subscriber.quit().catch(() => undefined);
  };

  subscriber.on('error', (err) => {
    logger.warn({ err: String(err), jobId }, '[ws] Redis 订阅连接错误');
  });

  subscriber.on('message', (ch, message) => {
    if (ch !== channel) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });

  subscriber.subscribe(channel, (err) => {
    if (err) {
      logger.warn({ err: String(err), jobId }, '[ws] Redis subscribe 失败');
      ws.close(1011, 'Subscription failed');
      return;
    }
    // 推送一次握手确认，便于客户端识别连接就绪（非进度消息，type=connected 区分）
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected', jobId, channel }));
    }
  });

  ws.on('close', () => {
    logger.info({ jobId, userId }, '[ws] 连接已关闭，取消 Redis 订阅');
    cleanup();
  });

  ws.on('error', (err) => {
    logger.warn({ err: String(err), jobId }, '[ws] 连接异常');
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
