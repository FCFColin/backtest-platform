import { logger } from '../utils/logger.js';
import { loadCpiSeriesFromDb, loadTreasurySeriesFromDb } from '../db/macroData.js';
import { fetchGoJson } from './goDataServiceClient.js';
import {
  cpiEntryArraySchema,
  treasuryRateArraySchema,
  summarizeZodIssues,
} from '../schemas/dataServiceSchemas.js';
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

// CPI 数据低频更新（月频），TTL 防止陈旧值长期驻留
const CPI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cpiCache: Record<string, { map?: Record<string, number>; routeData?: unknown; ts: number }> =
  {};

async function fetchCpiFromGo(
  country: string,
): Promise<{ raw: unknown; map: Record<string, number> }> {
  try {
    const { success, data } = await fetchGoJson(`/api/data/cpi/${country}`);
    if (!success || !data) return { raw: null, map: {} };
    // zod 契约校验（dataServiceSchemas，绑定 store.go CPIEntry）：失败 log warn +
    // 降级为空 map（loadCpiMap 回落 DB / notFound 语义），不炸请求但可观测
    const parsed = cpiEntryArraySchema.safeParse(data);
    if (!parsed.success) {
      logger.warn(
        { country, issues: summarizeZodIssues(parsed.error) },
        '[cpiService] Go CPI 响应契约校验失败，按无数据降级处理',
      );
      return { raw: null, map: {} };
    }
    if (!Array.isArray(parsed.data)) return { raw: parsed.data, map: {} };
    const map = Object.fromEntries(parsed.data.map((item) => [item.date.slice(0, 10), item.value]));
    return { raw: parsed.data, map };
  } catch (err) {
    logger.warn({ err: err as Error, country }, '[cpiService] Go data-fetcher CPI 调用失败');
    return { raw: null, map: {} };
  }
}

export async function loadCpiMap(country: string): Promise<Record<string, number>> {
  const key = country.toLowerCase();
  if (cpiCache[key]?.map && Date.now() - cpiCache[key]!.ts < CPI_CACHE_TTL_MS) {
    return cpiCache[key]!.map!;
  }
  const series = await loadCpiSeriesFromDb(key);
  let cpiMap: Record<string, number> = {};
  for (const item of series) cpiMap[item.date] = item.value;
  if (Object.keys(cpiMap).length === 0) cpiMap = (await fetchCpiFromGo(key)).map;
  if (Object.keys(cpiMap).length > 0)
    cpiCache[key] = { ...cpiCache[key], map: cpiMap, ts: Date.now() };
  return cpiMap;
}

const CPI_DEGRADED_WARNING = 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据';

// ── U-2 Phase 2：窗口匹配年化无风险利率 ──────────────────────────────
// DB(treasury_rates) → 空 则 FRED 端点拉取。
// 关键口径：DGS3MO 为「年化报价」→ 年化 = 窗口内算术平均（与引擎 (CAGR−rf)/σ 一致）。
// 序列 <60 视为不可信 → null → 引擎 legacy 常量（golden 零漂移）。
// 旧单值缓存按窗口错配（不同 start/end 共用同一 value），现改为无缓存直查 DB；
// treasury_rates 全表 <10k 行且按 (series,date) 索引，单次查询 <5ms，无需 24h TTL。
export function annualizeTbillRates(
  rates: Array<{ date: string; rate: number }>,
  start: string,
  end: string,
): number | null {
  const inWindow = rates
    .filter((r) => r.date >= start.slice(0, 10) && r.date <= end.slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (inWindow.length < 60) return null;
  return inWindow.reduce((s, r) => s + r.rate, 0) / inWindow.length;
}

async function fetchTreasuryFromGo(
  series: string,
  start: string,
  end: string,
): Promise<Array<{ date: string; rate: number }>> {
  try {
    const { success, data } = await fetchGoJson(
      `/api/data/treasury/${series}?start=${start}&end=${end}`,
    );
    if (!success) return [];
    // zod 契约校验（dataServiceSchemas，绑定 store.go TreasuryRate）：失败 log warn +
    // 返回空序列（annualizeTbillRates <60 → null → 引擎 legacy 常量，golden 零漂移）
    const parsed = treasuryRateArraySchema.safeParse(data);
    if (!parsed.success) {
      logger.warn(
        { series, issues: summarizeZodIssues(parsed.error) },
        '[treasuryService] Go 利率响应契约校验失败，按无数据降级处理',
      );
      return [];
    }
    return parsed.data ?? [];
  } catch (err) {
    logger.warn({ err: err as Error, series }, '[treasuryService] Go data-fetcher 调用失败');
    return [];
  }
}

export async function loadAnnualRiskFreeRate(start: string, end: string): Promise<number | null> {
  let rates = await loadTreasurySeriesFromDb('DGS3MO');
  if (rates.length === 0) rates = await fetchTreasuryFromGo('DGS3MO', start, end);
  return annualizeTbillRates(rates, start, end);
}

interface CpiRouteResult {
  data: unknown;
  degraded: boolean;
  degradedWarning?: string;
  notFound: boolean;
}

export async function fetchCpiForRoute(country: string): Promise<CpiRouteResult> {
  // key 归一为小写，与 loadCpiMap 共用同一缓存分区
  const key = country.toLowerCase();
  const { raw, map } = await fetchCpiFromGo(key);
  if (raw) return { data: raw, degraded: false, notFound: false };
  if (cpiCache[key]?.routeData && Date.now() - cpiCache[key]!.ts < CPI_CACHE_TTL_MS) {
    return {
      data: cpiCache[key]!.routeData,
      degraded: true,
      degradedWarning: CPI_DEGRADED_WARNING,
      notFound: false,
    };
  }
  const cpiData = await loadCpiSeriesFromDb(key);
  if (cpiData.length > 0) {
    cpiCache[key] = { ...cpiCache[key], routeData: cpiData, ts: Date.now() };
    return {
      data: cpiData,
      degraded: true,
      degradedWarning: CPI_DEGRADED_WARNING,
      notFound: false,
    };
  }
  if (Object.keys(map).length > 0) {
    cpiCache[key] = { ...cpiCache[key], routeData: map, ts: Date.now() };
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
