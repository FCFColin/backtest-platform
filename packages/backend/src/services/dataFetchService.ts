import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/index.js';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_DIR = path.join(PROJECT_ROOT, 'data-fetcher');

interface UpdateStatus {
  running: boolean;
  workerPid: number | null;
  mode: 'full' | 'incremental' | null;
  startedAt: string | null;
  completedTickers: number;
  totalTickers: number;
  lastError: string | null;
}

let currentProcess: ChildProcess | null = null;
let currentStatus: UpdateStatus = {
  running: false,
  workerPid: null,
  mode: null,
  startedAt: null,
  completedTickers: 0,
  totalTickers: 0,
  lastError: null,
};

function getDatabaseUrl(): string {
  return config.DATABASE_URL;
}

/**
 * 子进程环境变量白名单。
 *
 * 企业理由（RO-032）：`...process.env` 透传会将全部环境变量（含 JWT_SECRET、
 * API 密钥等敏感凭证）泄漏到子进程，违反最小权限原则。白名单仅放行 Go worker
 * 实际需要的变量，敏感凭证不再无差别继承。
 */
const WORKER_ENV_WHITELIST = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'LANG',
  'LC_ALL',
  'TZ',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
] as const;

/**
 * 构建 Go worker 子进程环境变量（白名单过滤 + config 注入）。
 *
 * @returns 仅包含白名单变量 + DATABASE_URL + NODE_ENV 的环境对象
 */
function buildWorkerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of WORKER_ENV_WHITELIST) {
    const val = process.env[key];
    if (val !== undefined) env[key] = val;
  }
  env.DATABASE_URL = getDatabaseUrl();
  env.NODE_ENV = config.NODE_ENV;
  return env;
}

export function getUpdateStatus(): UpdateStatus {
  return { ...currentStatus };
}

export async function startUpdate(
  mode: 'full' | 'incremental',
): Promise<{ success: boolean; message: string; pid?: number }> {
  if (currentProcess) {
    return { success: false, message: '已有更新任务正在运行' };
  }

  const pool = getPool();
  const totalResult = await pool.query('SELECT COUNT(*) as count FROM tickers');
  const totalTickers = parseInt(totalResult.rows[0].count, 10) || 0;

  const args = ['run', './cmd/worker/main.go', 'update'];
  if (mode === 'incremental') {
    args.push('--incremental');
  }

  logger.info({ mode, args, totalTickers }, '[dataFetchService] 启动更新');

  const child = spawn('go', args, {
    cwd: WORKER_DIR,
    env: buildWorkerEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  currentProcess = child;
  currentStatus = {
    running: true,
    workerPid: child.pid ?? null,
    mode,
    startedAt: new Date().toISOString(),
    completedTickers: 0,
    totalTickers,
    lastError: null,
  };

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        logger.info(parsed, '[worker]');
      } catch {
        logger.info('[worker] %s', line.trim());
      }
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) {
      logger.error('[worker/stderr] %s', text);
    }
  });

  child.on('close', (code) => {
    currentStatus.running = false;
    currentProcess = null;
    if (code === 0) {
      logger.info('[dataFetchService] 更新完成');
    } else {
      currentStatus.lastError = `Worker 进程退出，code=${code ?? -1}`;
      logger.error('[dataFetchService] 更新失败，code=%d', code ?? -1);
    }
  });

  child.on('error', (err) => {
    currentStatus.running = false;
    currentProcess = null;
    currentStatus.lastError = err.message;
    logger.error('[dataFetchService] 启动 worker 失败: %s', err.message);
  });

  return {
    success: true,
    message: `${mode === 'incremental' ? '增量' : '全量'}更新已启动`,
    pid: child.pid ?? undefined,
  };
}

export function stopUpdate(): { success: boolean; message: string } {
  if (!currentProcess) {
    return { success: false, message: '没有正在运行的更新任务' };
  }

  const pid = currentProcess.pid;
  if (pid) {
    spawn('taskkill', ['/PID', pid.toString(), '/F', '/T'], { stdio: 'ignore' });
  }

  currentProcess = null;
  currentStatus.running = false;
  currentStatus.lastError = '用户手动停止';

  return { success: true, message: '更新已停止' };
}
