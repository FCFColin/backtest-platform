/**
 * 数据更新基础设施（P1-2 重构）
 *
 * 替换 child_process.spawn('go', ['run', ...]) 为 BullMQ 异步任务。
 *
 * 原实现问题：
 * 1. `go run` 每次编译源码，生产环境不应使用
 * 2. 进程管理依赖 `taskkill`（Windows 命令），无法在 Linux/容器环境正常工作
 * 3. 进度状态存在内存全局变量（违反架构约束）
 * 4. 无法在 K8s 中水平扩展（状态不共享）
 *
 * 新实现：
 * - startUpdate() → dataUpdateQueue.add() 入队
 * - getUpdateStatus() → 从 BullMQ job 状态读取
 * - stopUpdate() → job.remove() 取消任务
 * - 进度存储在 Redis（BullMQ 内置），而非内存全局变量
 */
import {
  dataUpdateQueue,
  getActiveUpdateJobs,
  type DataUpdateJobData,
} from '../queues/dataUpdateQueue.js';
import { logger } from '../utils/logger.js';

interface UpdateStatus {
  running: boolean;
  mode: 'full' | 'incremental' | null;
  startedAt: string | null;
  completedTickers: number;
  totalTickers: number;
  lastError: string | null;
}

/** 空闲状态常量 */
const IDLE_STATUS: UpdateStatus = {
  running: false,
  mode: null,
  startedAt: null,
  completedTickers: 0,
  totalTickers: 0,
  lastError: null,
};

/**
 * 查询当前更新状态（从 BullMQ job 状态读取，无内存全局变量）。
 *
 * @returns 当前更新状态
 */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  const jobs = await getActiveUpdateJobs();
  if (jobs.length === 0) return { ...IDLE_STATUS };

  const job = jobs[0];
  const state = await job.getState();
  const data = job.data as DataUpdateJobData;
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  return {
    running: state === 'active' || state === 'waiting' || state === 'delayed',
    mode: data.mode,
    startedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    completedTickers: progress,
    totalTickers: 0,
    lastError: null,
  };
}

/**
 * 启动数据更新任务（入队 BullMQ，不再 spawn 子进程）。
 *
 * @param mode - 更新模式：全量或增量
 * @returns 操作结果
 */
export async function startUpdate(
  mode: 'full' | 'incremental',
): Promise<{ success: boolean; message: string; jobId?: string }> {
  // 检查是否有正在运行的任务
  const activeJobs = await getActiveUpdateJobs();
  if (activeJobs.length > 0) {
    return { success: false, message: '已有更新任务正在运行' };
  }

  const job = await dataUpdateQueue.add(
    'data-update',
    { mode },
    { jobId: `data-update-${mode}-${Date.now()}` },
  );

  logger.info({ jobId: job.id, mode }, '[dataFetch] 数据更新任务已入队');

  return {
    success: true,
    message: `${mode === 'incremental' ? '增量' : '全量'}更新已启动`,
    jobId: job.id ?? undefined,
  };
}

/**
 * 停止当前数据更新任务（取消 BullMQ job，不再使用 taskkill）。
 *
 * @returns 操作结果
 */
export async function stopUpdate(): Promise<{ success: boolean; message: string }> {
  const activeJobs = await getActiveUpdateJobs();
  if (activeJobs.length === 0) {
    return { success: false, message: '没有正在运行的更新任务' };
  }

  const job = activeJobs[0];
  await job.remove().catch((err: unknown) => {
    logger.warn({ err: String(err), jobId: job.id }, '[dataFetch] 移除任务失败');
  });

  logger.info({ jobId: job.id }, '[dataFetch] 更新任务已取消');

  return { success: true, message: '更新已停止' };
}
