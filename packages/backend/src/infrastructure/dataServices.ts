import { logger } from '../utils/logger.js';
import { loadCpiSeriesFromDb } from '../db/macroData.js';
import { fetchGoJson } from './goDataServiceClient.js';
import {
  dataUpdateQueue,
  getActiveUpdateJobs,
  type DataUpdateJobData,
} from '../queues/queueDefinitions.js';
import syntheticRowsData from './synthetic-tickers.json' with { type: 'json' };

export const SYNTHETIC_TICKERS = (
  syntheticRowsData as Array<[string, string, string, string, string]>
).map(([ticker, name, category, description, earliestDate]) => ({
  ticker,
  name,
  category,
  description,
  earliestDate,
  methodology: 'splice_by_return' as const,
}));

const cpiCache: Record<string, { map?: Record<string, number>; routeData?: unknown }> = {};

async function fetchCpiFromGo(
  country: string,
): Promise<{ raw: unknown; map: Record<string, number> }> {
  try {
    const { success, data } = await fetchGoJson(`/api/data/cpi/${country}`);
    if (!success || !data) return { raw: null, map: {} };
    if (!Array.isArray(data)) return { raw: data, map: {} };
    const map = Object.fromEntries(
      (data as Array<{ date: string; value: number }>)
        .filter((item) => item && typeof item.date === 'string')
        .map((item) => [item.date.slice(0, 10), item.value]),
    );
    return { raw: data, map };
  } catch (err) {
    logger.warn({ err: err as Error, country }, '[cpiService] Go data-fetcher CPI 调用失败');
    return { raw: null, map: {} };
  }
}

export async function loadCpiMap(country: string): Promise<Record<string, number>> {
  const key = country.toLowerCase();
  if (cpiCache[key]?.map) return cpiCache[key]!.map!;
  const series = await loadCpiSeriesFromDb(key);
  let cpiMap: Record<string, number> = {};
  for (const item of series) cpiMap[item.date] = item.value;
  if (Object.keys(cpiMap).length === 0) cpiMap = (await fetchCpiFromGo(key)).map;
  if (Object.keys(cpiMap).length > 0) cpiCache[key] = { ...cpiCache[key], map: cpiMap };
  return cpiMap;
}

const CPI_DEGRADED_WARNING = 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据';

interface CpiRouteResult {
  data: unknown;
  degraded: boolean;
  degradedWarning?: string;
  notFound: boolean;
}

export async function fetchCpiForRoute(country: string): Promise<CpiRouteResult> {
  const { raw, map } = await fetchCpiFromGo(country);
  if (raw) return { data: raw, degraded: false, notFound: false };
  if (cpiCache[country]?.routeData) {
    return {
      data: cpiCache[country]!.routeData,
      degraded: true,
      degradedWarning: CPI_DEGRADED_WARNING,
      notFound: false,
    };
  }
  const cpiData = await loadCpiSeriesFromDb(country);
  if (cpiData.length > 0) {
    cpiCache[country] = { ...cpiCache[country], routeData: cpiData };
    return {
      data: cpiData,
      degraded: true,
      degradedWarning: CPI_DEGRADED_WARNING,
      notFound: false,
    };
  }
  if (Object.keys(map).length > 0) {
    cpiCache[country] = { ...cpiCache[country], routeData: map };
    return { data: map, degraded: false, notFound: false };
  }
  return { data: null, degraded: false, notFound: true };
}

interface UpdateStatus {
  running: boolean;
  mode: 'full' | 'incremental' | null;
  startedAt: string | null;
  completedTickers: number;
  totalTickers: number;
  lastError: string | null;
}

const IDLE_STATUS: UpdateStatus = {
  running: false,
  mode: null,
  startedAt: null,
  completedTickers: 0,
  totalTickers: 0,
  lastError: null,
};

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

export async function startUpdate(
  mode: 'full' | 'incremental',
): Promise<{ success: boolean; message: string; jobId?: string }> {
  const activeJobs = await getActiveUpdateJobs();
  if (activeJobs.length > 0) return { success: false, message: '已有更新任务正在运行' };
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

export async function stopUpdate(): Promise<{ success: boolean; message: string }> {
  const activeJobs = await getActiveUpdateJobs();
  if (activeJobs.length === 0) return { success: false, message: '没有正在运行的更新任务' };
  const job = activeJobs[0];
  await job.remove().catch((err: unknown) => {
    logger.warn({ err: String(err), jobId: job.id }, '[dataFetch] 移除任务失败');
  });
  logger.info({ jobId: job.id }, '[dataFetch] 更新任务已取消');
  return { success: true, message: '更新已停止' };
}
