import { Client } from 'minio';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { loadCpiSeriesFromDb } from '../db/macroData.js';
import { callGoDataService } from './dataQuery.js';
import {
  dataUpdateQueue,
  getActiveUpdateJobs,
  type DataUpdateJobData,
} from '../queues/queueDefinitions.js';

interface SyntheticTicker {
  ticker: string;
  name: string;
  category: string;
  description: string;
  earliestDate: string;
  methodology: string;
}
// 全部 synthetic tickers 使用 splice_by_return 方法论，通过 map 统一注入
export const SYNTHETIC_TICKERS: SyntheticTicker[] = [
  {
    ticker: 'SPYSIM',
    name: 'S&P 500 Index (Total Return)',
    category: 'Index',
    description: 'S&P 500 total return index. Uses SPY adjusted close from 1993.',
    earliestDate: '1993-01-29',
  },
  {
    ticker: 'VTISIM',
    name: 'US Total Market (Total Return)',
    category: 'Index',
    description: 'VTSMX (1992-2001) spliced with VTI (2001-).',
    earliestDate: '1992-11-03',
  },
  {
    ticker: 'QQQSIM',
    name: 'Nasdaq 100 (Total Return)',
    category: 'Index',
    description: 'RYOCX (1994-1999) spliced with QQQ (1999-).',
    earliestDate: '1994-03-11',
  },
  {
    ticker: 'BNDSIM',
    name: 'US Aggregate Bond (Total Return)',
    category: 'Bond',
    description: 'VBMFX (1986-2007) spliced with BND (2007-).',
    earliestDate: '1986-12-18',
  },
  {
    ticker: 'GLDSIM',
    name: 'Gold (Total Return)',
    category: 'Commodity',
    description: 'GLD adjusted close from 2004.',
    earliestDate: '2004-11-18',
  },
  {
    ticker: 'TLTSIM',
    name: 'Long-Term Treasury (Total Return)',
    category: 'Bond',
    description: 'TLT adjusted close from 2002.',
    earliestDate: '2002-07-22',
  },
  {
    ticker: 'IEFSIM',
    name: 'Mid-Term Treasury (Total Return)',
    category: 'Bond',
    description: 'IEF adjusted close from 2002.',
    earliestDate: '2002-07-26',
  },
  {
    ticker: 'SHVSIM',
    name: 'Short-Term Treasury (Total Return)',
    category: 'Bond',
    description: 'SHV adjusted close from 2007.',
    earliestDate: '2007-01-11',
  },
  {
    ticker: 'VXUSSIM',
    name: 'International Equity (Total Return)',
    category: 'Equity',
    description: 'EFA (2001-2011) spliced with VXUS (2011-).',
    earliestDate: '2001-08-20',
  },
  {
    ticker: 'VNQSIM',
    name: 'REIT (Total Return)',
    category: 'RealEstate',
    description: 'VNQ adjusted close from 2004.',
    earliestDate: '2004-09-29',
  },
  {
    ticker: 'IWMSIM',
    name: 'Russell 2000 (Total Return)',
    category: 'Equity',
    description: 'IWM adjusted close from 2000.',
    earliestDate: '2000-05-22',
  },
  {
    ticker: 'EFASIM',
    name: 'MSCI EAFE (Total Return)',
    category: 'Equity',
    description: 'EFA adjusted close from 2001.',
    earliestDate: '2001-08-20',
  },
  {
    ticker: 'EEMSIM',
    name: 'Emerging Markets (Total Return)',
    category: 'Equity',
    description: 'EEM adjusted close from 2003.',
    earliestDate: '2003-04-11',
  },
  {
    ticker: 'TIPSIM',
    name: 'TIPS (Total Return)',
    category: 'Bond',
    description: 'TIP adjusted close from 2003.',
    earliestDate: '2003-12-05',
  },
  {
    ticker: 'AGGSIM',
    name: 'US Aggregate Bond (Total Return)',
    category: 'Bond',
    description: 'AGG adjusted close from 2003.',
    earliestDate: '2003-09-29',
  },
  {
    ticker: 'SCHBSIM',
    name: 'Broad Bond (Total Return)',
    category: 'Bond',
    description: 'SCHB adjusted close from 2010.',
    earliestDate: '2010-01-14',
  },
  {
    ticker: 'VTVOXSIM',
    name: 'Intermediate Bond (Total Return)',
    category: 'Bond',
    description: 'BIV adjusted close from 2009.',
    earliestDate: '2009-04-06',
  },
  {
    ticker: 'BSVSIM',
    name: 'Short-Term Bond (Total Return)',
    category: 'Bond',
    description: 'BSV adjusted close from 2007.',
    earliestDate: '2007-04-05',
  },
  {
    ticker: 'VTESIM',
    name: 'Tax-Exempt Bond (Total Return)',
    category: 'Bond',
    description: 'VTEB adjusted close from 2007.',
    earliestDate: '2007-12-07',
  },
].map((t) => ({ ...t, methodology: 'splice_by_return' }));

interface CpiCacheEntry {
  map?: Record<string, number>;
  routeData?: unknown;
}

const cpiCache: Record<string, CpiCacheEntry> = {};

async function fetchCpiFromGoService(country: string): Promise<unknown | null> {
  try {
    const response = await callGoDataService(`/api/data/cpi/${country}`);
    const parsed = JSON.parse(response) as { success?: boolean; data?: unknown };
    if (parsed.success && parsed.data) return parsed.data;
    return null;
  } catch (err) {
    logger.warn({ err: err as Error, country }, '[cpiService] Go data-fetcher CPI 调用失败');
    return null;
  }
}

async function fetchCpiMapFromGo(country: string): Promise<Record<string, number>> {
  const data = await fetchCpiFromGoService(country);
  if (!Array.isArray(data)) return {};
  const map: Record<string, number> = {};
  for (const item of data as Array<{ date: string; value: number }>) {
    if (!item || typeof item.date !== 'string') continue;
    map[item.date.slice(0, 10)] = item.value;
  }
  return map;
}

export async function loadCpiMap(country: string): Promise<Record<string, number>> {
  const key = country.toLowerCase();
  if (cpiCache[key]?.map) return cpiCache[key]!.map!;
  const series = await loadCpiSeriesFromDb(key);
  let cpiMap: Record<string, number> = {};
  for (const item of series) cpiMap[item.date] = item.value;
  if (Object.keys(cpiMap).length === 0) cpiMap = await fetchCpiMapFromGo(key);
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
  const goResult = await fetchCpiFromGoService(country);
  if (goResult) return { data: goResult, degraded: false, notFound: false };
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
  return { data: null, degraded: false, notFound: true };
}

const AUDIT_BUCKET = 'audit-logs';

let minioClient: Client | null = null;

export function isMinioConfigured(): boolean {
  return Boolean(config.MINIO_ENDPOINT);
}

function getClient(): Client | null {
  if (!isMinioConfigured()) return null;
  if (minioClient) return minioClient;
  minioClient = new Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
  });
  logger.info(
    {
      module: 'minioClient',
      endPoint: config.MINIO_ENDPOINT,
      port: config.MINIO_PORT,
      useSSL: config.MINIO_USE_SSL,
    },
    '[minio] MinIO 客户端已初始化',
  );
  return minioClient;
}

export async function ensureBucketExists(): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.warn('[minio] MinIO 未配置，跳过 bucket 初始化（审计日志仅留 DB）');
    return;
  }
  try {
    const exists = await client.bucketExists(AUDIT_BUCKET);
    if (exists) {
      logger.debug({ module: 'minioClient', bucket: AUDIT_BUCKET }, '[minio] bucket 已存在');
      return;
    }
    await client.makeBucket(AUDIT_BUCKET, 'us-east-1', { ObjectLocking: true });
    logger.info(
      { module: 'minioClient', bucket: AUDIT_BUCKET },
      '[minio] 已创建审计 bucket（Object Lock 已启用）',
    );
  } catch (err) {
    logger.error(
      { err: (err as Error).message, bucket: AUDIT_BUCKET },
      '[minio] bucket 初始化失败',
    );
    throw err;
  }
}

function computeRetainUntilDate(): string {
  const retainUntil = new Date(Date.now() + config.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return retainUntil.toISOString();
}

export async function uploadAuditObject(key: string, data: string | Buffer): Promise<boolean> {
  const client = getClient();
  if (!client) {
    logger.warn({ module: 'minioClient', key }, '[minio] MinIO 未配置，跳过审计对象上传');
    return false;
  }
  try {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const metaData = {
      'Content-Type': 'application/x-ndjson',
      'x-amz-object-lock-mode': 'COMPLIANCE',
      'x-amz-object-lock-retain-until-date': computeRetainUntilDate(),
    };
    await client.putObject(AUDIT_BUCKET, key, body, body.length, metaData);
    logger.info(
      { module: 'minioClient', key, size: body.length, retentionDays: config.AUDIT_RETENTION_DAYS },
      '[minio] 审计对象已上传（COMPLIANCE WORM）',
    );
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message, key }, '[minio] 审计对象上传失败');
    return false;
  }
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
