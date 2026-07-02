import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/index.js';

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
  return process.env.DATABASE_URL || 'postgresql://backtest:backtest@localhost:5432/backtest';
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
    env: {
      ...process.env,
      DATABASE_URL: getDatabaseUrl(),
    },
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

  return { success: true, message: `${mode === 'incremental' ? '增量' : '全量'}更新已启动`, pid: child.pid ?? undefined };
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
