/**
 * local server entry file, for local development
 *
 * 企业理由：OTel SDK 必须在所有其他模块加载前初始化，
 * 以确保 auto-instrumentation 能拦截 HTTP/Express 调用。
 * 因此 initTracing() 放在文件最顶部调用。
 */

// OTel 初始化必须在所有其他 import 之前
import { initTracing } from './tracing.js';
initTracing();

import app from './app.js';
import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { generateMetaFiles } from './services/engineService.js';
import { initDb } from './services/dataService.js';
import { startRustEngine, stopRustEngine } from './utils/rustEngineProcess.js';
import { getPool, closeDb } from './db/index.js';
import { OutboxPublisher } from './services/outboxPublisher.js';
import { eventDispatcher, BacktestCompletedHandler, RebalanceTriggeredHandler } from './domain/events/index.js';
import type { Server } from 'http';

// 启动时校验必需配置（生产环境下 ADMIN_API_KEY 必需）
validateConfig();

// OutboxPublisher 实例（Task 10.3），在 server.listen 回调中启动
let outboxPublisher: OutboxPublisher | null = null;

/**
 * start server with port
 */
const PORT = config.API_PORT;

const server = app.listen(PORT, async () => {
  logger.info(`Server ready on port ${PORT}`);

  // 初始化数据库 schema（PostgreSQL 迁移）
  try {
    await initDb();
  } catch (err) {
    logger.warn({ err }, '[startup] 数据库初始化失败，将回退到 JSON 文件');
  }

  // 注册领域事件处理器（Task 10.2）
  // OutboxPublisher.routeEvent 通过 eventDispatcher.dispatch 路由 outbox 事件到处理器
  eventDispatcher.register(new BacktestCompletedHandler());
  eventDispatcher.register(new RebalanceTriggeredHandler());

  // 启动 OutboxPublisher（Task 10.3）：LISTEN outbox_channel + 补偿扫描器
  // 数据库不可用时优雅降级，不阻塞服务启动
  try {
    outboxPublisher = new OutboxPublisher(getPool());
    await outboxPublisher.start();
  } catch (err) {
    logger.warn({ err }, '[startup] OutboxPublisher 启动失败');
  }

  // 自动启动 Rust 引擎子进程
  startRustEngine().catch((err) => {
    logger.warn(`[startup] Rust 引擎自动启动失败: ${(err as Error).message}，将降级到 Node.js`);
  });
});

// 服务启动后后台生成缺失的 meta 文件
setTimeout(async () => {
  try {
    await generateMetaFiles();
    logger.info('[startup] Meta files generated successfully');
  } catch (err) {
    logger.error({ err }, '[startup] Failed to generate meta files');
  }
}, 1000);

// 端口占用时优雅处理，避免进程崩溃
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error({ port: PORT }, 'Port is already in use');
    process.exit(1);
  } else {
    throw error;
  }
});

/**
 * 优雅关闭标志位，防止多次触发
 *
 * 企业理由：Docker stop / K8s pod termination 可能发送多次 SIGTERM，
 * 重复执行 server.close() 和 closeDb() 会导致不可预期的错误。
 */
let shuttingDown = false;

/**
 * 注册优雅关闭处理器（Task 5.1 + 5.2）
 *
 * 企业理由：容器编排系统（Docker/K8s）发送 SIGTERM 后，
 * 默认 30s 内若进程未退出则发送 SIGKILL 强制终止。
 * 优雅关闭确保：
 * 1. server.close() 停止接收新连接，等待在途请求完成
 * 2. closeDb() 关闭数据库连接池，避免连接泄漏
 * 3. 30s 强制退出兜底，防止 server.close() 因长连接挂起
 * 4. shuttingDown 标志位防止重复触发
 *
 * @param server - HTTP Server 实例
 */
export function setupGracefulShutdown(server: Server): void {
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      logger.info({ signal }, '[shutdown] 已在关闭流程中，忽略重复信号');
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, `Received ${signal}, starting graceful shutdown...`);

    // 30s 强制退出兜底：防止 server.close() 因长连接挂起
    const forceExitTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 30s, forcing exit');
      process.exit(1);
    }, 30000);

    // 停止 Rust 引擎子进程
    stopRustEngine();

    server.close(async () => {
      try {
        // 先停止 OutboxPublisher（关闭 LISTEN 连接 + 补偿扫描器），再关闭连接池
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

// 注册优雅关闭处理器
setupGracefulShutdown(server);

export default app;