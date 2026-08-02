import { initTracing, shutdownTracing } from '../tracing.js';
initTracing();

import { validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { initDb } from '../infrastructure/dataFacade.js';
import { closeDb } from '../db/pool.js';
import { eventDispatcher } from '../domain/events/events.js';
import { BacktestCompletedHandler, RunCompletedHandler } from '../application/completedHandlers.js';
import {
  createWebhookRetryWorker,
  scheduleWebhookRetryJob,
  createAuditExportWorker,
  scheduleAuditExportJob,
} from './queueDefinitions.js';
import { createDataUpdateWorker } from './dataUpdateWorker.js';
import { startHeartbeat } from './queueUtils.js';
import { shutdownWorker } from './worker.js'; // Backtest worker (module-level side effect: creates Worker at import time)
import type { Worker } from 'bullmq';

validateConfig();

eventDispatcher.register(new BacktestCompletedHandler());
eventDispatcher.register(new RunCompletedHandler());

let webhookWorker: Worker | null = null;
let auditExportWorker: Worker | null = null;
let dataUpdateWorker: Worker | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.info({ signal }, '[worker-entry] 已在关闭流程中，忽略重复信号');
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, `[worker-entry] ${signal} received, shutting down gracefully...`);

  const forceExitTimeout = setTimeout(() => {
    logger.error('[worker-entry] Graceful shutdown timed out after 60s, forcing exit');
    process.exit(1);
  }, 60_000);

  try {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (webhookWorker) {
      await webhookWorker.close();
      webhookWorker = null;
    }
    if (auditExportWorker) {
      await auditExportWorker.close();
      auditExportWorker = null;
    }
    if (dataUpdateWorker) {
      await dataUpdateWorker.close();
      dataUpdateWorker = null;
    }

    await shutdownWorker(signal);
    await closeDb();
    await shutdownTracing();
    logger.info('[worker-entry] Graceful shutdown complete');
  } catch (err) {
    logger.error({ err }, '[worker-entry] Error during shutdown');
  } finally {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

async function main(): Promise<void> {
  logger.info('[worker-entry] Starting unified worker process...');

  try {
    await initDb();
  } catch (err) {
    logger.error({ err }, '[worker-entry] Database initialization failed');
    throw err;
  }

  try {
    webhookWorker = createWebhookRetryWorker();
    await scheduleWebhookRetryJob();
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Webhook retry worker startup failed');
  }

  try {
    dataUpdateWorker = createDataUpdateWorker();
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Data update worker startup failed');
  }

  try {
    auditExportWorker = createAuditExportWorker();
    await scheduleAuditExportJob();
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Audit export worker startup failed');
  }

  try {
    heartbeatTimer = startHeartbeat();
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Heartbeat startup failed');
  }

  logger.info('[worker-entry] All workers started, waiting for jobs...');
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, '[worker-entry] Uncaught exception, shutting down');
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[worker-entry] Unhandled rejection, shutting down');
  void shutdown('unhandledRejection');
});

void main().catch((err) => {
  logger.error({ err }, '[worker-entry] Fatal error during startup');
  process.exit(1);
});
