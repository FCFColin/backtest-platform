import { shutdownTracing } from '../tracing.js';

import { validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { initDb } from '../infrastructure/dataFacade.js';
import { closeDb } from '../db/pool.js';
import { eventDispatcher } from '../domain/events/events.js';
import { AuditEventHandler } from '../application/auditEventHandler.js';
import { createAuditExportWorker, scheduleAuditExportJob } from './queueDefinitions.js';
import { createDataUpdateWorker } from './dataUpdateWorker.js';
import { startHeartbeat } from './queueUtils.js';
import { shutdownWorker } from './worker.js'; // Backtest worker (module-level side effect: creates Worker at import time)
import { createShutdownOnce } from '../utils/gracefulShutdown.js';
import type { Worker } from 'bullmq';

validateConfig();

eventDispatcher.register(new AuditEventHandler());

let auditExportWorker: Worker | null = null;
let dataUpdateWorker: Worker | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const shutdown = createShutdownOnce({
  timeoutMs: 60_000,
  prefix: 'worker-entry',
  onShutdown: async (signal) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
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
  },
});

async function main(): Promise<void> {
  logger.info('[worker-entry] Starting unified worker process...');

  try {
    await initDb();
  } catch (err) {
    logger.error({ err }, '[worker-entry] Database initialization failed');
    throw err;
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

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error({ err }, '[worker-entry] Uncaught exception, shutting down');
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[worker-entry] Unhandled rejection, shutting down');
  shutdown('unhandledRejection');
});

void main().catch((err) => {
  logger.error({ err }, '[worker-entry] Fatal error during startup');
  process.exit(1);
});
