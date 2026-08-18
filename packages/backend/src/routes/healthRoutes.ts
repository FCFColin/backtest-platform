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

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

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

const PROBE_TIMEOUT_MS = 3_000;

// 就绪探测必须整体有界：网络分区/依赖故障时在途查询或 ioredis 离线队列命令会无限挂起
//（pool 的 connectionTimeoutMillis 仅对新建连接生效），无超时会让探针被全局
// requestTimeout 30s 打成 408 而非快速 fail-closed（503；200+降级标记仅限数据端点，见 ADR-008）
function withProbeTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)),
        PROBE_TIMEOUT_MS,
      );
      timer.unref();
    }),
  ]);
}

async function checkDatabase(): Promise<boolean> {
  try {
    await withProbeTimeout(getPool().query('SELECT 1'));
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await withProbeTimeout(appRedis.ping())) === 'PONG';
  } catch {
    return false;
  }
}

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: {
        mode: isSentinelMode ? 'sentinel' : 'standalone',
      },
    },
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const [goEngineOk, goDataOk, dbOk, redisOk, sentinelHealth] = await Promise.all([
      checkHttp(`${config.GO_ENGINE_URL}/api/engine/health`),
      checkHttp(`${config.GO_DATA_SERVICE_URL}/api/data/health`),
      checkDatabase(),
      checkRedis(),
      checkSentinelMaster(),
    ]);

    if (!goEngineOk) {
      sendProblem(res, 503, 'ENGINE_UNAVAILABLE', undefined, { headers: { 'Retry-After': '30' } });
      return;
    }
    if (!dbOk) {
      sendProblem(res, 503, 'DATABASE_UNAVAILABLE');
      return;
    }

    const sentinelOk =
      sentinelHealth.isMaster === null ||
      (sentinelHealth.isMaster && (sentinelHealth.connectedSlaves ?? 0) >= 1);
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
        engine: { go: goEngineOk },
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
