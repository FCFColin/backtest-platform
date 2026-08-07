import { initTracing, shutdownTracing } from './tracing.js';
initTracing();

import app, { server } from './app.js';
import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { createShutdownOnce } from './utils/gracefulShutdown.js';
import { initDb } from './infrastructure/dataFacade.js';
import { bootstrapPlatformAdminKey, startApiKeyMonitoring } from './infrastructure/adminBoot.js';
import { getPool, getReadPool, closeDb } from './db/pool.js';
import { appRedis } from './infrastructure/redisClient.js';
import { createOutboxConsumer } from './infrastructure/outboxPublisher.js';
import { registerTimescaleMetrics, registerQueueMetrics } from './utils/metrics.js';
import { backtestQueue } from './queues/backtestQueue.js';
import { dataUpdateQueue } from './queues/queueDefinitions.js';
import { eventDispatcher } from './domain/events/events.js';
import { BacktestCompletedHandler, RunCompletedHandler } from './application/completedHandlers.js';
// P3-05：OutboxConsumer 接口类型——由 createOutboxConsumer 工厂按 CDC_KAFKA_ENABLED 选择实现
import type { OutboxConsumer } from './infrastructure/outboxPublisher.js';

validateConfig();

eventDispatcher.register(new BacktestCompletedHandler());
// P1-07：RunCompletedHandler——Run 聚合根进入 completed 态时触发（worker 路径）。
// 仅做观测日志（Run 本身已由 worker save() 持久化，不重复写库）。
// RunStarted/RunFailed/RunCancelled 不需要独立 handler：
// - RunStarted：worker 已在 job 开始时记录日志 + 更新 backtest_runs.status='running'
// - RunFailed：worker 已在 catch 中更新 status='failed' + error_message + WebSocket 通知
eventDispatcher.register(new RunCompletedHandler());

let outboxConsumer: OutboxConsumer | null = null;
const PORT = config.API_PORT;

server.listen(PORT, async () => {
  logger.info(`Server ready on port ${PORT}`);
  try {
    await initDb();
    // P1-01：注册 TimescaleDB 指标采集器（chunk 压缩率、CAGG 行数等）
    registerTimescaleMetrics(async (sql) => {
      const { rows } = await getReadPool().query(sql);
      return rows as Array<Record<string, unknown>>;
    });
    registerQueueMetrics([backtestQueue, dataUpdateQueue]);
    // P0-04：initSchema 完成后，将环境变量 ADMIN_API_KEY 一次性迁移为 DB 平台 break-glass 密钥
    await bootstrapPlatformAdminKey();
    // P0-04/T5：启动陈旧密钥定时巡检（更新 Prometheus gauge + 告警）
    startApiKeyMonitoring();

    const preheats: Array<[string, () => Promise<unknown>]> = [
      [
        'DB 连接',
        async () => {
          const c = await getPool().connect();
          c.release();
        },
      ],
      ['appRedis', () => appRedis.ping()],
      [
        'Go 引擎',
        () =>
          fetch(`${config.GO_ENGINE_URL}/api/engine/health`, { signal: AbortSignal.timeout(3000) }),
      ],
    ];
    for (const [name, fn] of preheats) {
      try {
        await fn();
        logger.info(`[startup] ${name}预热完成`);
      } catch {
        /* 预热失败不影响启动 */
      }
    }
    const { warmMetaCache } = await import('./routes/dataRoutes.js');
    await warmMetaCache();
    const { fetchHistoryData } = await import('./infrastructure/dataFacade.js');
    void fetchHistoryData(
      ['VTI', 'BND', 'SPY', 'QQQ', 'GLD', 'TLT', 'AGG', 'VXUS'],
      '2010-01-01',
      '2024-12-31',
    ).catch(() => {});
  } catch (err) {
    logger.warn({ err }, '[startup] 数据库初始化失败');
  }
  try {
    // P3-05：通过工厂创建 Outbox 消费器——CDC_KAFKA_ENABLED=true 走 Kafka CDC，
    // 否则走 LISTEN/NOTIFY（默认，零额外依赖）。详见 ADR-051。
    outboxConsumer = createOutboxConsumer(getPool());
    await outboxConsumer.start();
  } catch (err) {
    logger.warn({ err }, '[startup] Outbox 消费器启动失败');
  }
  // P0-1：Webhook 投递重试 Worker 已移至独立 Worker 进程（workerEntrypoint.ts），
  // API 服务器不再管理 Worker 生命周期。Worker 崩溃/重启不影响 API 服务。
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error({ port: PORT }, 'Port is already in use');
    process.exit(1);
  } else {
    throw error;
  }
});

const shutdown = createShutdownOnce({
  onShutdown: async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (outboxConsumer) {
      await outboxConsumer.stop();
      outboxConsumer = null;
    }
    await shutdownTracing();
    await closeDb();
  },
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// P0-01：未捕获异常必须终止进程——不终止会导致状态不一致（连接池/事件循环可能已损坏）。
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[server] 未捕获异常，启动优雅关闭后终止进程');
  shutdown('uncaughtException', 1);
});

// P0-01：未处理 Promise 拒绝必须终止进程——Node 未来版本会将 unhandledRejection 直接 crash。
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[server] 未处理 Promise 拒绝，终止进程');
  process.exit(1);
});

export default app;
