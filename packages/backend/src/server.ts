import { initTracing, shutdownTracing } from './tracing.js';
initTracing();

import app, { server } from './app.js';
import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDb } from './infrastructure/dataFacade.js';
import { bootstrapPlatformAdminKey } from './infrastructure/platformAdminBootstrap.js';
import { startApiKeyMonitoring } from './infrastructure/apiKeyMonitoring.js';
import { getPool, getReadPool, closeDb } from './db/pool.js';
import { appRedis } from './infrastructure/redisClient.js';
import { createOutboxConsumer, setWebhookHandler } from './infrastructure/outboxPublisher.js';
import { registerTimescaleMetrics, registerQueueMetrics } from './utils/metrics.js';
import { backtestQueue } from './queues/backtestQueue.js';
import { dataUpdateQueue } from './queues/dataUpdateQueue.js';
import { webhookQueue } from './queues/webhookQueue.js';
import { eventDispatcher } from './domain/events/index.js';
import { BacktestCompletedHandler } from './application/backtestCompletedHandler.js';
import { RunCompletedHandler } from './application/runCompletedHandler.js';
import { triggerWebhooks } from './application/webhookService.js';
import type { Server } from 'http';
// P3-05：OutboxConsumer 接口类型——由 createOutboxConsumer 工厂按 CDC_KAFKA_ENABLED 选择实现
import type { OutboxConsumer } from './infrastructure/outboxPublisher.js';

validateConfig();

// DDD: 注册领域事件处理器
// BacktestCompleted：由 backtest-service 在引擎返回后分发，持久化运行摘要到 backtest_runs
eventDispatcher.register(new BacktestCompletedHandler());
// P1-07：RunCompletedHandler——Run 聚合根进入 completed 态时触发（worker 路径）。
// 仅做观测日志（Run 本身已由 worker save() 持久化，不重复写库）。
// RunStarted/RunFailed/RunCancelled 不需要独立 handler：
// - RunStarted：worker 已在 job 开始时记录日志 + 更新 backtest_runs.status='running'
// - RunFailed：worker 已在 catch 中更新 status='failed' + error_message + WebSocket 通知
// - RunCancelled：worker 已在 cancel 检查中更新 status='cancelled'
eventDispatcher.register(new RunCompletedHandler());

// P3-05：变量重命名为 outboxConsumer，统一承载 LISTEN/NOTIFY 与 Kafka CDC 两种实现
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
    // D9-H1：注册 BullMQ 队列深度指标（告警引用的 bullmq_queue_size）
    registerQueueMetrics([backtestQueue, dataUpdateQueue, webhookQueue]);
    // P0-04：initSchema 完成后，将环境变量 ADMIN_API_KEY 一次性迁移为 DB 平台 break-glass 密钥
    await bootstrapPlatformAdminKey();
    // P0-04/T5：启动陈旧密钥定时巡检（更新 Prometheus gauge + 告警）
    startApiKeyMonitoring();

    // 预热连接：DB、Redis、Go 引擎，避免首次请求冷启动延迟
    try {
      const conn = await getPool().connect();
      conn.release();
      logger.info('[startup] DB 连接预热完成');
    } catch { /* 预热失败不影响启动 */ }
    try {
      await appRedis.ping();
      logger.info('[startup] appRedis 连接预热完成');
    } catch { /* 预热失败不影响启动 */ }
    try {
      await fetch(`${config.GO_ENGINE_URL}/api/engine/health`, { signal: AbortSignal.timeout(3000) });
      logger.info('[startup] Go 引擎连接预热完成');
    } catch { /* 预热失败不影响启动 */ }
    // 预热 /data/meta 缓存，使首次页面加载无需等待 14.5M 行聚合查询
    const { warmMetaCache } = await import('./routes/dataRoutes.js');
    await warmMetaCache();
  } catch (err) {
    logger.warn({ err }, '[startup] 数据库初始化失败');
  }
  try {
    // P3-05：通过工厂创建 Outbox 消费器——CDC_KAFKA_ENABLED=true 走 Kafka CDC，
    // 否则走 LISTEN/NOTIFY（默认，零额外依赖）。详见 ADR-051。
    outboxConsumer = createOutboxConsumer(getPool());
    await outboxConsumer.start();
    // P2-02：注册 webhook 触发回调——outbox 事件处理完后触发匹配的 webhook 订阅。
    // 回调注入而非直接依赖，保持基础设施层 → 应用层单向依赖。
    // outbox payload 为 JSONB（unknown），此处桥接为 triggerWebhooks 期望的对象类型。
    setWebhookHandler((orgId, eventType, payload) =>
      triggerWebhooks(orgId, eventType, payload as Record<string, unknown>),
    );
  } catch (err) {
    logger.warn({ err }, '[startup] Outbox 消费器启动失败');
  }
  // P0-1：Webhook 投递重试 Worker 已移至独立 Worker 进程（workerEntrypoint.ts），
  // API 服务器不再管理 Worker 生命周期。Worker 崩溃/重启不影响 API 服务。
  // Worker 进程通过 docker-compose worker 服务或 K8s backtest-worker Deployment 部署。
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error({ port: PORT }, 'Port is already in use');
    process.exit(1);
  } else {
    throw error;
  }
});

let shuttingDown = false;

/**
 * 触发优雅关闭流程。
 *
 * 关闭 HTTP server → 停止 outbox 消费器 → 关闭 webhook worker → 关闭 DB 连接池，
 * 然后以指定退出码终止进程。30s 超时强制退出兜底。
 *
 * @param signal - 触发关闭的信号名称（用于日志）
 * @param exitCode - 进程退出码（SIGTERM/SIGINT=0，uncaughtException=1）
 */
function triggerShutdown(signal: string, exitCode: number = 0): void {
  if (shuttingDown) {
    logger.info({ signal }, '[shutdown] 已在关闭流程中，忽略重复信号');
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, `Received ${signal}, starting graceful shutdown...`);

  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30000);

  server.close(async () => {
    try {
      if (outboxConsumer) {
        await outboxConsumer.stop();
        outboxConsumer = null;
      }
      await closeDb();
      await shutdownTracing();
      logger.info('Graceful shutdown complete');
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    } finally {
      clearTimeout(forceExitTimeout);
      process.exit(exitCode);
    }
  });
}

/**
 * 注册 SIGTERM/SIGINT 信号处理器，触发优雅关闭后以 0 退出。
 *
 * @param _server - HTTP server 实例（保留参数兼容旧调用，实际使用模块级 server）
 */
export function setupGracefulShutdown(_server: Server): void {
  process.on('SIGTERM', () => triggerShutdown('SIGTERM', 0));
  process.on('SIGINT', () => triggerShutdown('SIGINT', 0));
}

setupGracefulShutdown(server);

// P0-01：未捕获异常必须终止进程——不终止会导致状态不一致（连接池/事件循环可能已损坏）。
// 日志记录后触发优雅关闭（复用 triggerShutdown），最终 process.exit(1) 让 K8s 重启 Pod。
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[server] 未捕获异常，启动优雅关闭后终止进程');
  triggerShutdown('uncaughtException', 1);
});

// P0-01：未处理 Promise 拒绝必须终止进程——Node 未来版本会将 unhandledRejection 直接 crash。
// 提前适配：记录错误日志后立即退出，由 K8s restartPolicy: Always 自动恢复。
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[server] 未处理 Promise 拒绝，终止进程');
  process.exit(1);
});

export default app;
