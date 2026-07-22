import { initTracing } from './tracing.js';
initTracing();

import app from './app.js';
import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDb } from './infrastructure/dataFacade.js';
import { getPool, closeDb } from './db/pool.js';
import { OutboxPublisher } from './infrastructure/outboxPublisher.js';
import { eventDispatcher } from './domain/events/index.js';
import { BacktestCompletedHandler } from './application/backtestCompletedHandler.js';
import { RunCompletedHandler } from './application/runCompletedHandler.js';
import type { Server } from 'http';

validateConfig();

// DDD: 注册领域事件处理器 — BacktestCompleted 持久化运行摘要到 backtest_runs
eventDispatcher.register(new BacktestCompletedHandler());
// ADR-013 Phase 3：RunCompleted 观测副作用（日志），不重复持久化
eventDispatcher.register(new RunCompletedHandler());

let outboxPublisher: OutboxPublisher | null = null;
const PORT = config.API_PORT;

const server = app.listen(PORT, async () => {
  logger.info(`Server ready on port ${PORT}`);
  try {
    await initDb();
  } catch (err) {
    logger.warn({ err }, '[startup] 数据库初始化失败');
  }
  try {
    outboxPublisher = new OutboxPublisher(getPool());
    await outboxPublisher.start();
  } catch (err) {
    logger.warn({ err }, '[startup] OutboxPublisher 启动失败');
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

let shuttingDown = false;

export function setupGracefulShutdown(server: Server): void {
  const shutdown = (signal: string) => {
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
        if (outboxPublisher) {
          await outboxPublisher.stop();
          outboxPublisher = null;
        }
        await closeDb();
        logger.info('Graceful shutdown complete');
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
      } finally {
        clearTimeout(forceExitTimeout);
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

setupGracefulShutdown(server);

process.on('uncaughtException', (err) => {
  logger.error({ err }, '[server] 未捕获异常，服务继续运行');
});
process.on('unhandledRejection', (reason) => {
  logger.warn({ err: reason }, '[server] 未处理 Promise 拒绝，服务继续运行');
});

export default app;
