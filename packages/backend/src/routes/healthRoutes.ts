/**
 * 健康检查路由（含调试端点，ADR-042 合并）
 * GET /api/health          - 轻量存活探针（不暴露依赖拓扑）
 * GET /api/ready           - 深度就绪检查（含引擎/DB/Redis，需 METRICS_AUTH_TOKEN 鉴权）
 * GET /api/metrics         - Prometheus 格式指标端点
 * GET /api/v1/debug/health - 调试子系统存活探测（需 DEBUG_AUTH_TOKEN 鉴权，T-29）
 */

import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { sendProblem } from '../utils/errors.js';
import { getPrometheusRegister } from '../utils/metrics.js';
import { getPool } from '../db/pool.js';
import { appRedis, checkSentinelMaster, isSentinelMode } from '../infrastructure/redisClient.js';
import { crudRouteHandler } from './routeUtils.js';

const router = Router();

/**
 * 恒定时间字符串比较（D2-004）。
 *
 * 使用 crypto.timingSafeEqual 防止计时侧信道攻击。长度不匹配时直接返回 false
 * （攻击者可控输入长度，且 secret 长度本身不属于敏感信息）。
 *
 * @param a - 用户提供的令牌
 * @param b - 服务端配置的令牌
 * @returns 两字符串内容与长度均一致时返回 true
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * 校验运维端点 Bearer 令牌（恒定时间比较，D2-004/005）。
 *
 * @param req - Express 请求
 * @param res - Express 响应（鉴权失败时直接写入错误响应）
 * @param expectedToken - 期望的令牌（未配置时 fail-closed）
 * @param notConfiguredCode - 未配置令牌时的错误码（/metrics 用 METRICS_AUTH_NOT_CONFIGURED，debug 用 NOT_FOUND）
 * @param notConfiguredStatus - 未配置令牌时的状态码（/metrics 用 403，debug 用 404）
 * @returns true 表示已鉴权通过；false 表示已写入错误响应，调用方应 return
 */
function checkBearerToken(
  req: Request,
  res: Response,
  expectedToken: string | undefined,
  notConfiguredCode: string,
  notConfiguredStatus: number,
): boolean {
  if (!expectedToken) {
    sendProblem(res, notConfiguredStatus, notConfiguredCode);
    return false;
  }
  const auth = req.headers.authorization;
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!safeEqual(provided, expectedToken)) {
    sendProblem(res, 401, 'UNAUTHORIZED');
    return false;
  }
  return true;
}

async function checkHttp(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/** 探测 PostgreSQL：执行轻量 SELECT 1。 */
async function checkDatabase(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/** 探测 Redis：PING。 */
async function checkRedis(): Promise<boolean> {
  try {
    return (await appRedis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

/**
 * GET /api/health — 轻量存活探针（liveness）。
 *
 * 企业为何需要：对外暴露的探针不应泄露引擎/DB/Redis 拓扑，避免侦察攻击。
 * 仅确认 Node 进程可响应；编排器用 /ready 做流量切换决策。
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      // P0-3：包含 Redis 模式信息（sentinel/standalone），便于运维快速确认高可用状态
      redis: {
        mode: isSentinelMode ? 'sentinel' : 'standalone',
      },
    },
  });
});

/**
 * GET /api/ready — 深度就绪检查（readiness）。
 *
 * 并行探测引擎、数据库、Redis、Go 数据服务，返回分项状态。
 * Sentinel 模式下额外校验 master 角色与从节点拓扑（ADR-045 T6）。
 * 配置 METRICS_AUTH_TOKEN 时须 Bearer 鉴权（与 /metrics 一致）。
 */
router.get('/ready', async (req: Request, res: Response) => {
  if (!checkBearerToken(req, res, config.METRICS_AUTH_TOKEN, 'METRICS_AUTH_NOT_CONFIGURED', 403))
    return;

  try {
    const [goEngineOk, goDataOk, dbOk, redisOk, sentinelHealth] = await Promise.all([
      checkHttp(`${config.GO_ENGINE_URL}/api/engine/health`),
      checkHttp(`${config.GO_DATA_SERVICE_URL}/api/data/health`),
      checkDatabase(),
      checkRedis(),
      checkSentinelMaster(),
    ]);

    // ADR-031 fail-closed：Go 引擎不可用即返回 503 + Retry-After
    if (!goEngineOk) {
      sendProblem(res, 503, 'ENGINE_UNAVAILABLE', undefined, {
        headers: { 'Retry-After': '30' },
      });
      return;
    }

    // 数据库不可用视为 error（无法服务请求）
    if (!dbOk) {
      sendProblem(res, 503, 'DATABASE_UNAVAILABLE');
      return;
    }

    // ADR-045 T6：Sentinel 模式下，master 角色缺失或无从节点 → 503
    // （min-slaves-to-write=1 下 master 无从节点会拒绝写入，等同于不可用）
    const sentinelOk =
      sentinelHealth.isMaster === null
        ? true
        : sentinelHealth.isMaster && (sentinelHealth.connectedSlaves ?? 0) >= 1;
    if (!sentinelOk) {
      sendProblem(res, 503, 'REDIS_SENTINEL_NO_MASTER', undefined, {
        headers: { 'Retry-After': '30' },
        detail: `Sentinel master unhealthy (isMaster=${sentinelHealth.isMaster}, slaves=${sentinelHealth.connectedSlaves})`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        engine: {
          go: goEngineOk,
        },
        dependencies: {
          database: dbOk,
          redis: redisOk,
          goDataService: goDataOk,
          redisSentinel: isSentinelMode
            ? {
                mode: 'sentinel',
                isMaster: sentinelHealth.isMaster,
                connectedSlaves: sentinelHealth.connectedSlaves,
              }
            : { mode: 'standalone' },
        },
      },
    });
  } catch (error) {
    logger.error({ error }, '[healthRoutes] Readiness check failed');
    sendProblem(res, 503, 'READINESS_CHECK_ERROR');
  }
});

/**
 * Prometheus 指标端点
 *
 * 企业理由：Prometheus 是 K8s 生态监控标准，/metrics 端点必须返回
 * Prometheus text format（text/plain; version=0.0.4），而非自定义 JSON。
 * 这使得 Prometheus server 可以直接抓取指标并配置告警规则。
 */
router.get(
  '/metrics',
  crudRouteHandler(
    async (req, res): Promise<void> => {
      if (
        !checkBearerToken(req, res, config.METRICS_AUTH_TOKEN, 'METRICS_AUTH_NOT_CONFIGURED', 403)
      )
        return;
      res.set('Content-Type', getPrometheusRegister().contentType);
      res.end(await getPrometheusRegister().metrics());
    },
    {
      logMsg: '[healthRoutes] Failed to generate metrics',
      code: 'METRICS_ERROR',
    },
  ),
);

// 调试端点（原 debugRoutes.ts 合并，T-29）
//
// 企业理由：生产排障需 CPU/堆快照，但端点必须鉴权以防信息泄露。
// 仅当 DEBUG_AUTH_TOKEN 配置时启用，未配置时返回 404。

/** GET /api/v1/debug/health — 调试子系统存活探测 */
router.get('/v1/debug/health', (req, res) => {
  if (!checkBearerToken(req, res, config.DEBUG_AUTH_TOKEN, 'NOT_FOUND', 404)) return;
  res.json({
    success: true,
    data: {
      node: process.version,
      pid: process.pid,
      uptimeSec: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

export default router;
