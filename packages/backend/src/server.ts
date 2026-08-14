import { shutdownTracing } from './tracing.js';

import app, { server, backtestWs } from './app.js';
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
import { AuditEventHandler } from './application/auditEventHandler.js';
// P3-05：OutboxConsumer 接口类型——由 createOutboxConsumer 工厂按 CDC_KAFKA_ENABLED 选择实现
import type { OutboxConsumer } from './infrastructure/outboxPublisher.js';

validateConfig();

eventDispatcher.register(new AuditEventHandler());

let outboxConsumer: OutboxConsumer | null = null;
const PORT = config.API_PORT;

server.listen(PORT, async () => {
  logger.info(`Server ready on port ${PORT}`);
  // initDb 内部优雅降级不抛出（dataFacade.ts）；DB 恢复后靠 worker fail-fast 兜底，见 data-service.test.ts
  await initDb();
  try {
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
  } catch (err) {
    logger.warn({ err }, '[startup] 非关键初始化失败，服务继续运行');
  }
  try {
    // P3-05：通过工厂创建 Outbox 消费器——CDC_KAFKA_ENABLED=true 走 Kafka CDC，
    // 否则走 LISTEN/NOTIFY（默认，零额外依赖）。详见 ADR-005。
    outboxConsumer = createOutboxConsumer(getPool());
    await outboxConsumer.start();
  } catch (err) {
    logger.warn({ err }, '[startup] Outbox 消费器启动失败');
  }
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
    // 先断开活动 WS 客户端：Node 的 server.close() 不回收 upgrade 后的 socket，
    // 不关掉它们 close 回调永不触发（优雅停机会一直挂到超时强杀）。
    backtestWs.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    appRedis.disconnect();
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

// P0-01：未处理 Promise 拒绝必须终止进程——Node 未来版本会将 unhandledRejection 直接 crash；
// 与 uncaughtException 一致走优雅关闭（保证审计链/DB 落盘后再退出，退出码 1）。
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[server] 未处理 Promise 拒绝，启动优雅关闭后终止进程');
  shutdown('unhandledRejection', 1);
});

export default app;
