/**
 * 数据引擎服务 v2
 * 对接 Python engine 模块，管理全市场数据更新
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { isValidTicker } from '../utils/tickerValidation.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_DIR = path.resolve(__dirname, '../../api/python');
const DATA_DIR = path.resolve(__dirname, '../../data/market');
const STATE_DIR = path.join(DATA_DIR, 'state');

/** 调用 Python engine 模块 */
function callEngine(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    // Reliability: Python子进程30s超时保护
    // 企业为何需要：Python进程可能挂起（死锁/无限循环），无超时则Node.js进程也挂起
    // 权衡：30s可能不足以完成复杂计算，但防止DoS比完成计算更重要
    const proc = spawn(pythonCmd, ['-m', 'engine.main', ...args], {
      cwd: ENGINE_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`Engine exited ${code}: ${stderr.slice(-500)}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err: Error) => { reject(err); });
  });
}

/** 异步启动引擎（不等待完成） */
function spawnEngineAsync(args: string[]): string {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const proc = spawn(pythonCmd, ['-m', 'engine.main', ...args], {
    cwd: ENGINE_DIR,
    stdio: 'ignore',
    detached: true,
  });
  proc.unref();
  return `Engine started: engine.main ${args.join(' ')}`;
}

/** 获取引擎状态 */
export function getEngineStatus(): {
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
  progress: Record<string, unknown> | null;
  universeAge: string | null;
} {
  // 统计已缓存标的
  const tickersDir = path.join(DATA_DIR, 'tickers');
  let cachedTickers = 0;
  let lastUpdate: string | null = null;

  if (fs.existsSync(tickersDir)) {
    const files = fs.readdirSync(tickersDir).filter((f) => f.endsWith('.json'));
    cachedTickers = files.length;
    for (const file of files) {
      const stat = fs.statSync(path.join(tickersDir, file));
      const mtime = stat.mtime.toISOString();
      if (!lastUpdate || mtime > lastUpdate) lastUpdate = mtime;
    }
  }

  // 读取进度
  let progress: Record<string, unknown> | null = null;
  const progressFile = path.join(STATE_DIR, 'progress.json');
  if (fs.existsSync(progressFile)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
    } catch (err) {
      logger.warn(`[engineService] 读取进度文件失败: ${(err as Error).message}`);
    }
  }

  // 读取宇宙信息
  let totalTickers = 0;
  let universeAge: string | null = null;
  const universeFile = path.join(STATE_DIR, 'universe.json');
  if (fs.existsSync(universeFile)) {
    try {
      const universe = JSON.parse(fs.readFileSync(universeFile, 'utf-8'));
      totalTickers = Array.isArray(universe) ? universe.length : (universe.tickers?.length || 0);
      const stat = fs.statSync(universeFile);
      const ageMs = Date.now() - stat.mtimeMs;
      const ageHours = Math.floor(ageMs / 3600000);
      universeAge = ageHours < 24 ? `${ageHours}小时前` : `${Math.floor(ageHours / 24)}天前`;
    } catch (err) {
      logger.warn(`[engineService] 读取宇宙文件失败: ${(err as Error).message}`);
    }
  }

  return { totalTickers, cachedTickers, lastUpdate, progress, universeAge };
}

/** 触发全量更新 */
export function triggerFullUpdate(): { status: string; message: string } {
  spawnEngineAsync(['full']);
  return { status: 'started', message: '全量更新已在后台启动，覆盖全市场标的' };
}

/** 触发增量更新 */
export function triggerIncrementalUpdate(): { status: string; message: string } {
  spawnEngineAsync(['incremental']);
  return { status: 'started', message: '增量更新已在后台启动' };
}

/** 重新获取已有标的的完整历史 */
export function triggerRefetch(): { status: string; message: string } {
  spawnEngineAsync(['refetch']);
  return { status: 'started', message: '重新获取已有标的的完整历史数据（1970/1990起始）' };
}

/** 恢复中断的更新 */
export function triggerResume(): { status: string; message: string } {
  spawnEngineAsync(['resume']);
  return { status: 'started', message: '正在恢复中断的更新' };
}

/** 刷新标的宇宙 */
export async function triggerUniverseRefresh(): Promise<{ status: string; message: string }> {
  try {
    await callEngine(['universe']);
    return { status: 'completed', message: '标的宇宙已刷新' };
  } catch (err) {
    return { status: 'error', message: `刷新失败: ${(err as Error).message}` };
  }
}

/** 获取标的列表（从宇宙文件） */
export async function getTickerList(): Promise<Array<{ ticker: string; name: string; category: string; market: string }>> {
  const universeFile = path.join(STATE_DIR, 'universe.json');
  if (fs.existsSync(universeFile)) {
    try {
      const universe = JSON.parse(fs.readFileSync(universeFile, 'utf-8'));
      const tickers = universe.tickers || universe;
      if (Array.isArray(tickers)) {
        return tickers.slice(0, 500).map((t: Record<string, string>) => ({
          ticker: t.ticker || t.symbol || '',
          name: t.name || t.ticker || '',
          category: t.category || t.type || '',
          market: t.market || t.exchange || '',
        }));
      }
    } catch (err) {
      logger.warn(`[engineService] 读取标的列表失败: ${(err as Error).message}`);
    }
  }

  // Fallback: 从缓存目录生成
  const tickersDir = path.join(DATA_DIR, 'tickers');
  if (fs.existsSync(tickersDir)) {
    return fs.readdirSync(tickersDir)
      .filter((f) => f.endsWith('.json'))
      .slice(0, 500)
      .map((f) => {
        const ticker = f.replace('.json', '').replace(/_/g, '.');
        return { ticker, name: ticker, category: '', market: '' };
      });
  }

  return [];
}

/** 搜索标的 */
export async function searchTickers(query: string): Promise<Array<{ ticker: string; name: string; category: string; market: string }>> {
  const all = await getTickerList();
  const q = query.toLowerCase();
  return all.filter(
    (t) =>
      t.ticker.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.market.toLowerCase().includes(q)
  ).slice(0, 30);
}

/** 加载标的数据（从缓存） */
export function loadTickerData(ticker: string): Record<string, unknown> | null {
  // 校验 ticker 格式，防止路径遍历
  if (!isValidTicker(ticker)) {
    logger.warn(`[engineService] loadTickerData: 拒绝非法 ticker: ${ticker}`);
    return null;
  }

  const tickersDir = path.join(DATA_DIR, 'tickers');
  const fileName = ticker.replace(/\./g, '_') + '.json';
  const filePath = path.join(tickersDir, fileName);

  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return null; }
  }
  return null;
}

// ============================================================
// 纯 Node.js 统计扫描（替代 Python spawn，毫秒级响应）
// ============================================================

const TICKERS_DIR = path.join(DATA_DIR, 'tickers');
const INDICES_DIR = path.join(DATA_DIR, 'indices');
const STATS_CACHE_PATH = path.join(STATE_DIR, 'stats_cache.json');
const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟

interface CachedStats {
  generated_at: string;
  total_cached: number;
  by_market: Record<string, { count: number; stocks: number; etfs: number; indices: number }>;
  by_type: Record<string, number>;
  by_exchange: Record<string, number>;
  date_ranges: { earliest: string | null; latest: string | null };
  by_decade: Record<string, number>;
  by_year_count: Record<string, number>;
  coverage: {
    tickers_with_5y_plus: number;
    tickers_with_10y_plus: number;
    tickers_with_20y_plus: number;
    avg_data_points: number;
    median_data_points: number;
  };
  data_quality: {
    with_adj_close: number;
    with_dividends: number;
    with_splits: number;
    total_data_points: number;
    total_size_mb: number;
  };
  recent_updates: Array<{ ticker: string; name: string; updated: string }>;
  sample_tickers: Record<string, Array<{ ticker: string; name: string; first_date: string; last_date: string; data_points: number }>>;
}

/** 读取 stats 缓存 */
function readStatsCache(): CachedStats | null {
  if (!fs.existsSync(STATS_CACHE_PATH)) return null;
  try {
    const stat = fs.statSync(STATS_CACHE_PATH);
    const age = Date.now() - stat.mtimeMs;
    if (age > STATS_CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(STATS_CACHE_PATH, 'utf-8'));
  } catch { return null; }
}

/** 写入 stats 缓存 */
function writeStatsCache(data: CachedStats): void {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATS_CACHE_PATH, JSON.stringify(data), 'utf-8');
  } catch (err) {
    logger.warn(`[engineService] 写入统计缓存失败: ${(err as Error).message}`);
  }
}

/** 纯 Node.js 扫描所有已缓存标的，生成详细统计（同步版，仅用于缓存命中） */
export function scanTickersStats(force = false): CachedStats | null {
  // 检查缓存
  if (!force) {
    const cached = readStatsCache();
    if (cached) return cached;
    // 无缓存时返回 null，让路由层触发后台扫描（避免同步阻塞事件循环 60s）
    return null;
  }

  // force=true 时也返回 null，由异步版本处理
  return null;
}

/** 异步扫描所有已缓存标的，生成详细统计（不阻塞事件循环） */
export async function scanTickersStatsAsync(force = false): Promise<CachedStats | null> {
  // 检查缓存
  if (!force) {
    const cached = readStatsCache();
    if (cached) return cached;
  }

  const byMarket: Record<string, { count: number; stocks: number; etfs: number; indices: number }> = {};
  const byType: Record<string, number> = {};
  const byExchange: Record<string, number> = {};
  const byDecade: Record<string, number> = {};
  const byYearCount: Record<string, number> = {};
  let totalCached = 0;
  let earliest: string | null = null;
  let latest: string | null = null;
  let tickers5y = 0, tickers10y = 0, tickers20y = 0;
  let withAdjClose = 0, withDividends = 0, withSplits = 0;
  let totalDataPoints = 0;
  let totalSizeBytes = 0;
  const allPoints: number[] = [];
  const allUpdates: Array<{ ticker: string; name: string; updated: string }> = [];
  const sampleTickers: Record<string, Array<{ ticker: string; name: string; first_date: string; last_date: string; data_points: number }>> = {
    us_stock: [], us_etf: [], cn_stock: [], cn_etf: [], index: [],
  };

  const dirs = [TICKERS_DIR, INDICES_DIR];
  let fileCount = 0;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.json') && !f.endsWith('.meta.json'));
    for (const file of files) {
      const fpath = path.join(dir, file);
      try {
        const fstat = await fs.promises.stat(fpath);
        totalSizeBytes += fstat.size;

        // 优先读取 .meta.json（小文件，只读一次）
        const metaFile = path.join(dir, file.replace('.json', '.meta.json'));
        let ticker: string;
        let market: string;
        let ttype: string;
        let exchange: string;
        let lastUpdated: string;
        let nPoints: number;
        let firstDate = '';
        let lastDate = '';
        let hasAdj = false;
        let hasDiv = false;
        let hasSplit = false;
        let name = '';

        if (fs.existsSync(metaFile)) {
          const metaStat = await fs.promises.stat(metaFile);
          if (metaStat.mtimeMs > fstat.mtimeMs) {
            // meta 文件比数据文件新，直接用 meta（小文件，毫秒级）
            const metaRaw = JSON.parse(await fs.promises.readFile(metaFile, 'utf-8')) as {
              ticker?: string; name?: string; market?: string; type?: string;
              exchange?: string; last_updated?: string;
              dateRange?: { start: string | null; end: string | null };
              dataPoints?: number; hasAdjClose?: boolean; hasDividend?: boolean; hasSplit?: boolean;
            };
            ticker = metaRaw.ticker || file.replace('.json', '');
            name = metaRaw.name || '';
            market = metaRaw.market || (ticker.endsWith('.SS') || ticker.endsWith('.SZ') || ticker.endsWith('.SH') ? 'CN' : 'US');
            ttype = (metaRaw.type || 'STOCK').toUpperCase();
            exchange = metaRaw.exchange || '';
            lastUpdated = metaRaw.last_updated || '';
            nPoints = metaRaw.dataPoints || 0;
            const dr = metaRaw.dateRange;
            firstDate = dr?.start || '';
            lastDate = dr?.end || '';
            hasAdj = !!metaRaw.hasAdjClose;
            hasDiv = !!metaRaw.hasDividend;
            hasSplit = !!metaRaw.hasSplit;
          } else {
            // meta 过期，回退到完整 JSON
            const content = await fs.promises.readFile(fpath, 'utf-8');
            const raw = JSON.parse(content.replace(/:\s*NaN/g, ': null'));
            const rawMeta = raw.meta || {};
            ticker = rawMeta.ticker || file.replace('.json', '');
            name = rawMeta.name || '';
            market = rawMeta.market || (ticker.endsWith('.SS') || ticker.endsWith('.SZ') || ticker.endsWith('.SH') ? 'CN' : 'US');
            ttype = (rawMeta.type || 'STOCK').toUpperCase();
            exchange = rawMeta.exchange || '';
            lastUpdated = rawMeta.last_updated || '';
            const prices = raw.prices || [];
            nPoints = prices.length;
            firstDate = prices[0]?.date || '';
            lastDate = prices[prices.length - 1]?.date || '';
            /* eslint-disable @typescript-eslint/no-explicit-any */
            hasAdj = prices.some((p: Record<string, any>) => p.adj_close);
            hasDiv = prices.some((p: Record<string, any>) => (p.dividend || 0) > 0);
            hasSplit = prices.some((p: Record<string, any>) => (p.split_factor || 1) !== 1);
            /* eslint-enable @typescript-eslint/no-explicit-any */
          }
        } else {
          // 无 meta 文件，回退到完整 JSON
          const content = await fs.promises.readFile(fpath, 'utf-8');
          const raw = JSON.parse(content.replace(/:\s*NaN/g, ': null'));
          const rawMeta = raw.meta || {};
          ticker = rawMeta.ticker || file.replace('.json', '');
          name = rawMeta.name || '';
          market = rawMeta.market || (ticker.endsWith('.SS') || ticker.endsWith('.SZ') || ticker.endsWith('.SH') ? 'CN' : 'US');
          ttype = (rawMeta.type || 'STOCK').toUpperCase();
          exchange = rawMeta.exchange || '';
          lastUpdated = rawMeta.last_updated || '';
          const prices = raw.prices || [];
          nPoints = prices.length;
          firstDate = prices[0]?.date || '';
          lastDate = prices[prices.length - 1]?.date || '';
          /* eslint-disable @typescript-eslint/no-explicit-any */
          hasAdj = prices.some((p: Record<string, any>) => p.adj_close);
          hasDiv = prices.some((p: Record<string, any>) => (p.dividend || 0) > 0);
          hasSplit = prices.some((p: Record<string, any>) => (p.split_factor || 1) !== 1);
          /* eslint-enable @typescript-eslint/no-explicit-any */
        }

        totalCached++;
        byType[ttype] = (byType[ttype] || 0) + 1;
        if (!byMarket[market]) byMarket[market] = { count: 0, stocks: 0, etfs: 0, indices: 0 };
        byMarket[market].count++;
        if (ttype === 'STOCK') byMarket[market].stocks++;
        else if (ttype === 'ETF') byMarket[market].etfs++;
        else if (ttype === 'INDEX') byMarket[market].indices++;
        byExchange[exchange] = (byExchange[exchange] || 0) + 1;

        if (firstDate) {
          if (!earliest || firstDate < earliest) earliest = firstDate;
          if (!latest || lastDate > latest) latest = lastDate;
          const decade = firstDate.slice(0, 3) + '0s';
          byDecade[decade] = (byDecade[decade] || 0) + 1;
          try {
            const startY = parseInt(firstDate.slice(0, 4));
            const endY = parseInt((lastDate || firstDate).slice(0, 4));
            const years = endY - startY;
            const bucket = `${Math.floor(years / 5) * 5}-${Math.floor(years / 5) * 5 + 4}年`;
            byYearCount[bucket] = (byYearCount[bucket] || 0) + 1;
            if (years >= 5) tickers5y++;
            if (years >= 10) tickers10y++;
            if (years >= 20) tickers20y++;
          } catch (err) {
            logger.warn(`[engineService] 解析年份范围失败: ${(err as Error).message}`);
          }
        }
        allPoints.push(nPoints);
        totalDataPoints += nPoints;
        if (hasAdj) withAdjClose++;
        if (hasDiv) withDividends++;
        if (hasSplit) withSplits++;

        // 样本
        let sampleKey = '';
        if (market === 'US' && ttype === 'STOCK') sampleKey = 'us_stock';
        else if (market === 'US' && ttype === 'ETF') sampleKey = 'us_etf';
        else if (market === 'CN' && ttype === 'STOCK') sampleKey = 'cn_stock';
        else if (market === 'CN' && ttype === 'ETF') sampleKey = 'cn_etf';
        else if (ttype === 'INDEX') sampleKey = 'index';
        if (sampleKey && sampleTickers[sampleKey].length < 5) {
          sampleTickers[sampleKey].push({
            ticker,
            name,
            first_date: firstDate,
            last_date: lastDate,
            data_points: nPoints,
          });
        }

        if (lastUpdated) {
          allUpdates.push({ ticker, name, updated: lastUpdated });
        }
      } catch (err) {
        logger.warn(`[engineService] 跳过损坏文件 ${file}: ${(err as Error).message}`);
      }

      // 每 100 个文件让出事件循环
      fileCount++;
      if (fileCount % 100 === 0) {
        await new Promise(r => setImmediate(r));
      }
    }
  }

  // 统计量
  const avgPoints = allPoints.length > 0 ? Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length) : 0;
  const sorted = [...allPoints].sort((a, b) => a - b);
  const medianPoints = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

  allUpdates.sort((a, b) => b.updated.localeCompare(a.updated));

  const result: CachedStats = {
    generated_at: new Date().toISOString(),
    total_cached: totalCached,
    by_market: byMarket,
    by_type: byType,
    by_exchange: byExchange,
    date_ranges: { earliest, latest },
    by_decade: byDecade,
    by_year_count: byYearCount,
    coverage: {
      tickers_with_5y_plus: tickers5y,
      tickers_with_10y_plus: tickers10y,
      tickers_with_20y_plus: tickers20y,
      avg_data_points: avgPoints,
      median_data_points: medianPoints,
    },
    data_quality: {
      with_adj_close: withAdjClose,
      with_dividends: withDividends,
      with_splits: withSplits,
      total_data_points: totalDataPoints,
      total_size_mb: Math.round(totalSizeBytes / 1024 / 1024 * 10) / 10,
    },
    recent_updates: allUpdates.slice(0, 20),
    sample_tickers: sampleTickers,
  };

  writeStatsCache(result);
  return result;
}

/** 生成 .meta.json 预计算元数据文件（10-50x 扫描加速） */
export async function generateMetaFiles(): Promise<void> {
  const dirs = [
    { dir: TICKERS_DIR, type: 'ticker' },
    { dir: INDICES_DIR, type: 'index' },
  ];

  for (const { dir, type } of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json') || file.endsWith('.meta.json')) continue;
      const metaFile = path.join(dir, file.replace('.json', '.meta.json'));
      const fpath = path.join(dir, file);
      // Skip if meta already exists and is newer than data file
      if (fs.existsSync(metaFile)) {
        const dataStat = await fs.promises.stat(fpath);
        const metaStat = await fs.promises.stat(metaFile);
        if (metaStat.mtimeMs > dataStat.mtimeMs) continue;
      }
      // Read full file and extract metadata (handle NaN in JSON)
      let raw: Record<string, unknown>;
      try {
        const content = await fs.promises.readFile(fpath, 'utf-8');
        raw = JSON.parse(content.replace(/:\s*NaN/g, ': null'));
      } catch {
        logger.warn(`[generateMetaFiles] 跳过无效 JSON: ${file}`);
        continue;
      }
      const prices = (raw.prices || []) as Record<string, unknown>[];
      const meta = (raw.meta || {}) as Record<string, unknown>;
      const metaObj = {
        ticker: meta.ticker || raw.ticker || file.replace('.json', ''),
        name: meta.name || raw.name || '',
        market: meta.market || raw.market || '',
        type: meta.type || type,
        exchange: meta.exchange || raw.exchange || '',
        last_updated: meta.last_updated || raw.last_updated || '',
        dateRange: prices.length > 0
          ? { start: prices[0].date, end: prices[prices.length - 1].date }
          : { start: null, end: null },
        dataPoints: prices.length,
        fileSize: (await fs.promises.stat(fpath)).size,
        hasAdjClose: prices.some((p: Record<string, unknown>) => 'adj_close' in p),
        hasDividend: prices.some((p: Record<string, unknown>) => 'dividend' in p && p.dividend),
        hasSplit: prices.some((p: Record<string, unknown>) => 'split' in p && p.split),
      };
      await fs.promises.writeFile(metaFile, JSON.stringify(metaObj));
    }
  }
}

/** 获取标的宇宙统计（从 universe.json） */
export function getUniverseStats(): { total: number; updated_at: string; stats: Record<string, number> } {
  const universeFile = path.join(STATE_DIR, 'universe.json');
  if (fs.existsSync(universeFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(universeFile, 'utf-8'));
      return {
        total: data.total_count || 0,
        updated_at: data.updated_at || '',
        stats: data.stats || {},
      };
    } catch (err) {
      logger.warn(`[engineService] 读取宇宙统计失败: ${(err as Error).message}`);
    }
  }
  return { total: 0, updated_at: '', stats: {} };
}
