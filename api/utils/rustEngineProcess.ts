/**
 * Rust 引擎子进程管理
 *
 * 后端启动时自动 spawn Rust 引擎子进程，随主进程生命周期管理。
 * 子进程崩溃时自动重启（最多 3 次，指数退避 + Jitter）。
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { logger } from './logger.js';
import { resetRustAvailability } from './rustFallback.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_RESTART_ATTEMPTS = 3;

/**
 * 指数退避重启参数
 *
 * 企业理由：固定间隔重启在持续故障时会形成可预测的请求模式，
 * 且在故障未恢复时浪费资源。指数退避让重启间隔逐步增大，
 * 避免在底层问题未解决时频繁重启拖垮系统。Jitter 避免多实例
 * 同时重启的"惊群效应"。maxDelay 上限防止等待时间过长。
 * 权衡：退避期间 Rust 引擎不可用，请求全部降级到 Node.js，
 * 但比频繁重启消耗资源更优。
 */
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60000;
const JITTER_MS = 1000;

const HEALTH_CHECK_INTERVAL_MS = 10000;
const HEALTH_CHECK_TIMEOUT_MS = 2000;

let rustProcess: ChildProcess | null = null;
let restartCount = 0;
let isShuttingDown = false;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 计算指数退避延迟：min(baseDelay * 2^attempt + randomJitter, maxDelay)
 */
function getRestartDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * JITTER_MS;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

/** Rust 引擎可执行文件路径 */
function getEngineBinPath(): string {
  // Windows: engine-rs/target/release/engine-rs.exe
  // Unix: engine-rs/target/release/engine-rs
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.resolve(__dirname, '../../engine-rs/target/release/engine-rs' + ext);
}

/** cargo run --release 路径（作为 fallback） */
function getCargoPath(): string {
  return path.resolve(__dirname, '../../engine-rs');
}

/** 检查 Rust 引擎可执行文件是否已编译 */
function isEngineCompiled(): boolean {
  return fs.existsSync(getEngineBinPath());
}

/** 通过 HTTP 检查 Rust 引擎健康状态 */
function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const healthUrl = new URL('/api/engine/health', config.RUST_ENGINE_URL);
    const req = http.get(healthUrl.toString(), (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data.status === 'ok');
        } catch {
          resolve(false);
        }
      });
    });
    req.setTimeout(HEALTH_CHECK_TIMEOUT_MS, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/** 启动 Rust 引擎子进程 */
export async function startRustEngine(): Promise<void> {
  if (rustProcess) {
    logger.info('[RustEngine] 引擎子进程已在运行');
    return;
  }

  const binPath = getEngineBinPath();
  const useCompiled = isEngineCompiled();

  if (useCompiled) {
    logger.info(`[RustEngine] 使用已编译的二进制文件: ${binPath}`);
    rustProcess = spawn(binPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    logger.info(`[RustEngine] 未找到编译产物，使用 cargo run --release (首次会较慢)`);
    rustProcess = spawn('cargo', ['run', '--release'], {
      cwd: getCargoPath(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  const child = rustProcess;

  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) logger.info(`[RustEngine] ${msg}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) logger.warn(`[RustEngine] stderr: ${msg}`);
  });

  child.on('error', (err) => {
    logger.error({ err }, '[RustEngine] 子进程启动失败');
    rustProcess = null;
  });

  child.on('exit', (code, signal) => {
    logger.warn(`[RustEngine] 子进程退出: code=${code}, signal=${signal}`);
    rustProcess = null;

    if (!isShuttingDown && restartCount < MAX_RESTART_ATTEMPTS) {
      const delay = getRestartDelay(restartCount);
      restartCount++;
      logger.info(`[RustEngine] ${Math.round(delay / 1000)}秒后尝试第 ${restartCount}/${MAX_RESTART_ATTEMPTS} 次重启（指数退避）...`);
      setTimeout(() => {
        if (!isShuttingDown) startRustEngine();
      }, delay);
    } else if (!isShuttingDown) {
      logger.error({ attempts: MAX_RESTART_ATTEMPTS }, '[RustEngine] 已达最大重启次数，放弃重启');
    }
  });

  // 等待 Rust 引擎启动就绪（轮询 health 端点）
  const maxWaitMs = useCompiled ? 10000 : 120000; // cargo run 首次编译可能很慢
  const pollIntervalMs = 500;
  const startMs = Date.now();
  let ready = false;

  while (Date.now() - startMs < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    if (await checkHealth()) {
      ready = true;
      break;
    }
  }

  if (ready) {
    resetRustAvailability();
    restartCount = 0;
    logger.info(`[RustEngine] 引擎就绪 (耗时 ${Date.now() - startMs}ms)`);
  } else {
    logger.warn(`[RustEngine] 引擎未在 ${maxWaitMs / 1000}s 内就绪，后续请求将降级到 Node.js`);
  }

  // 启动定期健康检查
  healthCheckTimer = setInterval(async () => {
    const healthy = await checkHealth();
    if (healthy) {
      resetRustAvailability();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/** 停止 Rust 引擎子进程 */
export function stopRustEngine(): void {
  isShuttingDown = true;

  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  if (rustProcess) {
    logger.info('[RustEngine] 正在停止引擎子进程...');
    rustProcess.kill('SIGTERM');

    // 5 秒后强制杀死
    setTimeout(() => {
      if (rustProcess) {
        rustProcess.kill('SIGKILL');
        rustProcess = null;
      }
    }, 5000);
  }
}
