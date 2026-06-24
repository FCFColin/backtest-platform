/**
 * 批量数据引擎服务
 * 调用 Python 批量数据脚本，管理数据更新和查询
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data/market');
const BATCH_SCRIPT = path.resolve(__dirname, '../python/batch_data_engine.py');

/** 确保数据目录存在 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 调用 Python 脚本
 *
 * 企业理由：子进程调用必须有超时保护，否则 Python 脚本挂起时
 * Promise 永远不 resolve → 内存泄漏。这是确定性资源泄漏源。
 * 权衡：60 秒超时对批量数据操作可能偏短，但总比无限等待好。
 */
function callPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, [BATCH_SCRIPT, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // 企业理由：子进程必须有超时保护，防止挂起导致内存泄漏
    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
      reject(new Error('Python batch process timed out after 60 seconds'));
    }, 60000);

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code: number) => {
      clearTimeout(timeout);
      if (killed) return; // 已被超时 reject
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** 获取所有支持的标的列表 */
export async function getTickerList(): Promise<Array<{ ticker: string; category: string; market: string }>> {
  try {
    const result = await callPython(['list']);
    return JSON.parse(result);
  } catch {
    return getDefaultTickerList();
  }
}

/** 触发批量数据更新（异步，不等待完成） */
export function triggerUpdate(): { status: string; message: string } {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const proc = spawn(pythonCmd, [BATCH_SCRIPT, 'update', '--batch-size', '5', '--delay', '0.3'], {
    stdio: 'ignore',
    detached: true,
  });
  proc.unref();

  return { status: 'started', message: '数据更新已在后台启动' };
}

/** 获取数据更新状态 */
export function getUpdateStatus(): {
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
} {
  ensureDataDir();

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  let lastUpdate: string | null = null;

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const stat = fs.statSync(filePath);
    const mtime = stat.mtime.toISOString();
    if (!lastUpdate || mtime > lastUpdate) {
      lastUpdate = mtime;
    }
  }

  return {
    totalTickers: 141, // ALL_TICKERS length
    cachedTickers: files.length,
    lastUpdate,
  };
}

/** 从本地缓存加载标的数据 */
export function loadTickerDataFromCache(ticker: string): Record<string, number> | null {
  ensureDataDir();
  const fileName = ticker.replace(/\./g, '_') + '.json';
  const filePath = path.join(DATA_DIR, fileName);

  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

/** 搜索标的 */
export async function searchTickers(query: string): Promise<Array<{ ticker: string; name: string; category: string; market: string }>> {
  const allTickers = await getTickerList();
  const q = query.toLowerCase();
  return allTickers
    .filter(
      (t) =>
        t.ticker.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.market.toLowerCase().includes(q)
    )
    .map((t) => ({ ...t, name: t.ticker }))
    .slice(0, 20);
}

/** 默认标的列表 */
function getDefaultTickerList(): Array<{ ticker: string; category: string; market: string }> {
  return [
    { ticker: 'SPY', category: '美股宽基ETF', market: '美股' },
    { ticker: 'VOO', category: '美股宽基ETF', market: '美股' },
    { ticker: 'VTI', category: '美股宽基ETF', market: '美股' },
    { ticker: 'QQQ', category: '美股宽基ETF', market: '美股' },
    { ticker: 'IWM', category: '美股宽基ETF', market: '美股' },
    { ticker: 'BND', category: '美股宽基ETF', market: '美股' },
    { ticker: 'GLD', category: '美股宽基ETF', market: '美股' },
    { ticker: 'XLF', category: '美股行业ETF', market: '美股' },
    { ticker: 'XLK', category: '美股行业ETF', market: '美股' },
    { ticker: 'XLV', category: '美股行业ETF', market: '美股' },
    { ticker: 'AAPL', category: '美股热门股票', market: '美股' },
    { ticker: 'MSFT', category: '美股热门股票', market: '美股' },
    { ticker: 'GOOGL', category: '美股热门股票', market: '美股' },
    { ticker: 'AMZN', category: '美股热门股票', market: '美股' },
    { ticker: 'NVDA', category: '美股热门股票', market: '美股' },
    { ticker: 'TSLA', category: '美股热门股票', market: '美股' },
    { ticker: '510300.SS', category: 'A股ETF', market: 'A股' },
    { ticker: '510050.SS', category: 'A股ETF', market: 'A股' },
    { ticker: '159915.SZ', category: 'A股ETF', market: 'A股' },
    { ticker: '600519.SS', category: 'A股热门股票', market: 'A股' },
    { ticker: '000858.SZ', category: 'A股热门股票', market: 'A股' },
    { ticker: '300750.SZ', category: 'A股热门股票', market: 'A股' },
  ];
}
