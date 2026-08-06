import { logger } from './logger.js';

/**
 * 单例优雅停机：防重入 + 超时强杀 + 退出码。
 * server/worker 共用；onShutdown 收到触发信号（worker 需透传给 shutdownWorker）。
 * exitCode 按调用传（server: SIG 0 / uncaughtException 1；worker 恒 0）。
 */
export function createShutdownOnce(opts: {
  onShutdown: (signal: string) => Promise<void>;
  timeoutMs?: number;
  prefix?: string;
}): (signal: string, exitCode?: number) => void {
  const { onShutdown, timeoutMs = 30_000, prefix = '' } = opts;
  const tag = prefix ? `[${prefix}] ` : '';
  let shuttingDown = false;
  return (signal, exitCode = 0) => {
    if (shuttingDown) {
      logger.info({ signal }, `${tag}已在关闭流程中，忽略重复信号`);
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, `${tag}Received ${signal}, starting graceful shutdown...`);
    const forceExitTimeout = setTimeout(() => {
      logger.error(`${tag}Graceful shutdown timed out after ${timeoutMs / 1000}s, forcing exit`);
      process.exit(1);
    }, timeoutMs);
    onShutdown(signal)
      .then(() => logger.info(`${tag}Graceful shutdown complete`))
      .catch((err) => logger.error({ err }, `${tag}Error during shutdown`))
      .finally(() => {
        clearTimeout(forceExitTimeout);
        process.exit(exitCode);
      });
  };
}
