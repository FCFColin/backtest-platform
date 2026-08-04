/**
 * dev-supervisor.mjs
 *
 * 后台 supervisor：守护 API + Worker 进程，崩溃自动重启，graceful shutdown。
 * 由 schtasks 创建的计划任务调用，完全脱离终端。
 *
 * 架构：schtasks → node dev-supervisor.mjs → spawn API + Worker（windowsHide:true）
 *
 * 功能：
 * - 读 .env 加载环境变量
 * - spawn API + Worker（windowsHide:true, detached:true）→ 零控制台窗口
 * - 进程崩溃自动重启（指数退避，最大 30s）
 * - SIGINT/SIGTERM → 优雅关闭所有子进程
 * - PID 文件 → .dev-logs/dev-bg-pids.json（供 dev-stop 使用）
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { nodeCmd, PROJECT_ROOT, tsxLoaderUrl } from './_dev-shared.mjs';

const ROOT = PROJECT_ROOT;
const LOG_DIR = path.join(ROOT, '.dev-logs');
const PID_FILE = path.join(LOG_DIR, 'dev-bg-pids.json');
const LOCK_FILE = path.join(LOG_DIR, 'dev-supervisor.lock');

// ── 读 .env（Node 内置 dotenv 解析，写入 process.env）──
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {}

// ── 日志 ──
function log(tag, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${tag}] ${msg}`;
  console.log(line);
  try {
    writeFileSync(path.join(LOG_DIR, 'supervisor.log'), line + '\n', { flag: 'a' });
  } catch {}
}

// ── 写 PID 文件 ──
function savePids(pids) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(PID_FILE, JSON.stringify(pids, null, 2), 'utf-8');
}

// ── 读 PID 文件 ──
function loadPids() {
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

// ── 清理 PID 文件 ──
function cleanPids() {
  try { unlinkSync(PID_FILE); } catch {}
}

// ── 防止重复启动（lock file） ──
function checkLock() {
  try {
    const existing = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
    // 检查旧的 supervisor 是否还活着
    try {
      process.kill(existing.pid, 0);
      log('supervisor', `已有 supervisor 运行中 (PID ${existing.pid})，退出`);
      process.exit(0);
    } catch {
      // 旧的已经死了，清理 lock
      log('supervisor', `旧 supervisor (PID ${existing.pid}) 已不存在，接管`);
    }
  } catch {}
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid }), 'utf-8');
}

// ── 主逻辑 ──
if (!tsxLoaderUrl) {
  log('supervisor', '找不到 tsx loader，退出');
  process.exit(1);
}

const env = {
  ...process.env,
  SERVE_STATIC: 'true',
  COMPUTE_RATE_LIMIT_MAX: process.env.COMPUTE_RATE_LIMIT_MAX || '200',
  ENGINE_AUTH_TOKEN: process.env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token',
  DATA_SERVICE_AUTH_TOKEN: process.env.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token',
};

const PORT = process.env.PORT || process.env.API_PORT || '15001';

// ── 定义要守护的服务 ──
const SERVICES = [
  {
    name: 'backtest-api',
    args: ['--import', tsxLoaderUrl, 'packages/backend/src/server.ts'],
    env: { ...env, PORT },
    maxRestarts: 20,
    restartDelay: 3000,
  },
  {
    name: 'backtest-worker',
    args: ['--import', tsxLoaderUrl, 'packages/backend/src/queues/workerEntrypoint.ts'],
    env,
    maxRestarts: 20,
    restartDelay: 3000,
  },
];

// ── 进程管理 ──
const children = new Map(); // name → { proc, restartCount, lastRestart }
const shuttingDown = false;

function startService(svc) {
  const child = spawn(nodeCmd, svc.args, {
    cwd: ROOT,
    env: svc.env,
    stdio: 'ignore',
    detached: true,
    shell: false,
    windowsHide: true,  // CREATE_NO_WINDOW — 无控制台窗口
  });

  child.unref();

  const info = { proc: child, restartCount: 0, lastRestart: 0, config: svc };
  children.set(svc.name, info);

  log(svc.name, `启动 (PID ${child.pid})`);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(svc.name, `退出 code=${code} signal=${signal}`);
    handleExit(svc.name);
  });

  child.on('error', (err) => {
    log(svc.name, `错误: ${err.message}`);
    handleExit(svc.name);
  });

  return child.pid;
}

function handleExit(name) {
  if (shuttingDown) return;
  const info = children.get(name);
  if (!info) return;

  const now = Date.now();
  // 重置计数器（如果距离上次重启超过 60s）
  if (now - info.lastRestart > 60_000) {
    info.restartCount = 0;
  }

  info.restartCount++;
  info.lastRestart = now;

  if (info.restartCount > info.config.maxRestarts) {
    log(name, `连续重启 ${info.restartCount} 次，放弃`);
    return;
  }

  // 指数退避：3s, 6s, 12s, 最大 30s
  const delay = Math.min(info.config.restartDelay * Math.pow(1.5, info.restartCount - 1), 30_000);
  log(name, `${delay / 1000}s 后重启 (第 ${info.restartCount} 次)…`);

  setTimeout(() => {
    if (!shuttingDown) {
      startService(info.config);
    }
  }, delay);
}

// ── Graceful shutdown ──
function shutdown(signal) {
  log('supervisor', `收到 ${signal}，关闭所有子进程…`);
  shuttingDown = true;

  for (const [name, info] of children) {
    try {
      if (info.proc && !info.proc.killed) {
        log(name, `发送 SIGTERM (PID ${info.proc.pid})`);
        info.proc.kill('SIGTERM');
        // 5s 后强杀
        setTimeout(() => {
          try { info.proc.kill('SIGKILL'); } catch {}
        }, 5000);
      }
    } catch (err) {
      log(name, `关闭失败: ${err.message}`);
    }
  }

  // 清理文件
  cleanPids();
  try { unlinkSync(LOCK_FILE); } catch {}

  setTimeout(() => {
    log('supervisor', '退出');
    process.exit(0);
  }, 2000);
}

// ── 启动 ──
checkLock();

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// 清理旧 supervisor 日志
try { writeFileSync(path.join(LOG_DIR, 'supervisor.log'), '', 'utf-8'); } catch {}

log('supervisor', `启动 supervisor (PID ${process.pid})`);
log('supervisor', `项目根目录: ${ROOT}`);
log('supervisor', `API 端口: ${PORT}`);

const pids = {};
for (const svc of SERVICES) {
  pids[svc.name] = startService(svc);
}

savePids(pids);
log('supervisor', `PID 文件: ${PID_FILE}`);

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('supervisor', '所有服务已启动，守护中…');
