/**
 * 健康检查路由
 * GET /api/health  - 轻量存活探针（不暴露依赖拓扑）
 * GET /api/ready   - 深度就绪检查（含引擎/DB/Redis，需 METRICS_AUTH_TOKEN 鉴权）
 * GET /api/metrics - Prometheus 格式指标端点
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { sendProblem } from '../utils/errors.js';
import { getPrometheusRegister } from '../utils/metrics.js';
import { getPool } from '../db/pool.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { crudRouteHandler } from './routeUtils.js';

const router = Router();

/**
 * 校验运维端点 Bearer 令牌（与 /metrics 共用 METRICS_AUTH_TOKEN）。
 *
 * @returns true 表示已鉴权或未配置令牌（开发/内网）
 */
function isOpsEndpointAuthorized(req: Request): boolean {
  const metricsToken = config.METRICS_AUTH_TOKEN;
  if (!metricsToken) return true;
  const auth = req.headers.authorization;
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return provided === metricsToken;
}

/**
 * 探测一个 HTTP 依赖的连通性（带超时）。
 * 任何异常（超时、连接拒绝、非 2xx）均视为不可用，返回 false。
 */
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
    },
  });
});

/**
 * GET /api/ready — 深度就绪检查（readiness）。
 *
 * 并行探测引擎、数据库、Redis、Go 数据服务，返回分项状态。
 * 配置 METRICS_AUTH_TOKEN 时须 Bearer 鉴权（与 /metrics 一致）。
 */
router.get('/ready', async (req: Request, res: Response) => {
  if (!isOpsEndpointAuthorized(req)) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: 'Unauthorized' });
    return;
  }

  try {
    const [goEngineOk, goDataOk, dbOk, redisOk] = await Promise.all([
      checkHttp(`${config.GO_ENGINE_URL}/api/engine/health`),
      checkHttp(`${config.GO_DATA_SERVICE_URL}/api/data/health`),
      checkDatabase(),
      checkRedis(),
    ]);

    // ADR-031 fail-closed：Go 引擎不可用即返回 503 + Retry-After
    if (!goEngineOk) {
      sendProblem(res, 503, 'ENGINE_UNAVAILABLE', 'Engine Unavailable', {
        detail: 'Go 计算引擎暂不可用，计算端点将返回 503',
        headers: { 'Retry-After': '30' },
      });
      return;
    }

    // 数据库不可用视为 error（无法服务请求）
    if (!dbOk) {
      sendProblem(res, 503, 'DATABASE_UNAVAILABLE', 'Service Unavailable', {
        detail: '数据库不可用',
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
        },
      },
    });
  } catch (error) {
    logger.error({ error }, '[healthRoutes] Readiness check failed');
    sendProblem(res, 503, 'READINESS_CHECK_ERROR', 'Service Unavailable', {
      detail: 'Readiness check failed',
    });
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
    async (req: Request, res: Response): Promise<void> => {
      if (!isOpsEndpointAuthorized(req)) {
        sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: 'Unauthorized' });
        return;
      }
      res.set('Content-Type', getPrometheusRegister().contentType);
      res.end(await getPrometheusRegister().metrics());
    },
    {
      logMsg: '[healthRoutes] Failed to generate metrics',
      code: 'METRICS_ERROR',
      title: 'Metrics generation failed',
      detail: 'Failed to generate metrics',
    },
  ),
);

export default router;
