/**
 * JSON → PostgreSQL 数据导入工具
 *
 * 企业理由（ADR-007）：数据迁移需要可重复执行的导入工具，
 * 支持增量导入和断点续传。PostgreSQL 的 COPY 命令比 INSERT
 * 快 10-100 倍，是批量导入的标准方式。
 *
 * 权衡：COPY 命令需要文件或流输入，对于小批量数据
 * 使用参数化 INSERT 更简单安全（防 SQL 注入）。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PoolClient } from 'pg';
import { getPool, getClient } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data/market');
const TICKERS_DIR = path.join(DATA_DIR, 'tickers');

interface PriceRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
  adj_close?: number;
}

/**
 * 导入所有标的的价格数据（PostgreSQL 版本）
 *
 * 使用参数化 INSERT（防 SQL 注入），每个标的一个事务。
 * 对于大规模导入（> 10000 条），建议使用 COPY 命令。
 */
/** 每块最大行数（每行 8 个参数，1000 行 = 8000 参，远低于 PostgreSQL 65535 上限） */
const PRICE_UPSERT_CHUNK = 1000;

/**
 * 分块多行 upsert 价格数据（N+1 修复，T-17）。
 *
 * @param client - 已开启事务的连接
 * @param ticker - 标的代码
 * @param data - 价格记录数组
 */
async function upsertPricesBatched(
  client: PoolClient,
  ticker: string,
  data: PriceRecord[],
): Promise<void> {
  for (let i = 0; i < data.length; i += PRICE_UPSERT_CHUNK) {
    const chunk = data.slice(i, i + PRICE_UPSERT_CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((p, idx) => {
      const base = idx * 8;
      values.push(
        ticker,
        p.date,
        p.open,
        p.high,
        p.low,
        p.close,
        p.volume,
        p.adj_close ?? p.adjustedClose ?? null,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });
    await client.query(
      `INSERT INTO prices (ticker, date, open, high, low, close, volume, adjusted_close)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (ticker, date) DO UPDATE SET
         open = EXCLUDED.open,
         high = EXCLUDED.high,
         low = EXCLUDED.low,
         close = EXCLUDED.close,
         volume = EXCLUDED.volume,
         adjusted_close = EXCLUDED.adjusted_close`,
      values,
    );
  }
}

/** 汇率 upsert 分块大小（每行 4 参） */
const FX_UPSERT_CHUNK = 1000;

async function upsertExchangeRatesBatched(
  client: PoolClient,
  baseCurrency: string,
  targetCurrency: string,
  entries: [string, number][],
): Promise<void> {
  for (let i = 0; i < entries.length; i += FX_UPSERT_CHUNK) {
    const chunk = entries.slice(i, i + FX_UPSERT_CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map(([date, rate], idx) => {
      const base = idx * 4;
      values.push(baseCurrency, targetCurrency, date, rate);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await client.query(
      `INSERT INTO exchange_rates (base_currency, target_currency, date, rate)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (base_currency, target_currency, date) DO UPDATE SET rate = EXCLUDED.rate`,
      values,
    );
  }
}

/** 从单个 JSON 文件导入标的到 PostgreSQL */
async function importTickerFromFile(file: string): Promise<'imported' | 'skipped' | 'error'> {
  const ticker = file.replace('.json', '');
  const filePath = path.join(TICKERS_DIR, file);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const data: PriceRecord[] = Array.isArray(raw) ? raw : raw.prices || [];

    if (!Array.isArray(data) || data.length === 0) {
      return 'skipped';
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO tickers (ticker, category, market) VALUES ($1, $2, $3)
         ON CONFLICT (ticker) DO UPDATE SET updated_at = NOW()`,
        [ticker, '', ''],
      );
      await upsertPricesBatched(client, ticker, data);
      await client.query('COMMIT');
      logger.info({ ticker, priceCount: data.length }, '[import] 标的导入成功');
      return 'imported';
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err, ticker }, '[import] 导入失败');
    return 'error';
  }
}

/**
 * 导入指定标的（默认组合与常用 benchmark），避免回测走 JSON 冷解析。
 *
 * @param symbols - 标的代码，如 VTI、BND、SPY
 */
export async function importTickersBySymbols(
  symbols: string[],
): Promise<{ imported: number; skipped: number; errors: number }> {
  const result = { imported: 0, skipped: 0, errors: 0 };
  if (!fs.existsSync(TICKERS_DIR)) {
    logger.warn({ path: TICKERS_DIR }, '[import] 标的数据目录不存在');
    return result;
  }

  for (const symbol of symbols) {
    const file = `${symbol.replace(/\./g, '_')}.json`;
    const filePath = path.join(TICKERS_DIR, file);
    if (!fs.existsSync(filePath)) {
      logger.warn({ symbol, file }, '[import] 标的文件不存在，跳过');
      result.skipped++;
      continue;
    }
    const status = await importTickerFromFile(file);
    if (status === 'imported') result.imported++;
    else if (status === 'skipped') result.skipped++;
    else result.errors++;
  }

  return result;
}

export async function importAllTickers(): Promise<{
  imported: number;
  skipped: number;
  errors: number;
}> {
  const t0 = Date.now();
  const result = { imported: 0, skipped: 0, errors: 0 };

  if (!fs.existsSync(TICKERS_DIR)) {
    logger.warn({ path: TICKERS_DIR }, '[import] 标的数据目录不存在');
    return result;
  }

  const files = fs
    .readdirSync(TICKERS_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'));
  logger.info({ totalFiles: files.length }, '[import] 数据导入开始');

  for (const file of files) {
    const status = await importTickerFromFile(file);
    if (status === 'imported') result.imported++;
    else if (status === 'skipped') result.skipped++;
    else result.errors++;
  }

  logger.info({ ...result, durationMs: Date.now() - t0 }, '[import] 数据导入完成');
  return result;
}

/**
 * 使用 COPY 命令批量导入（高性能版本）
 *
 * 企业理由：PostgreSQL COPY 命令比 INSERT 快 10-100 倍，
 * 是大规模数据导入的标准方式（ETL/数据仓库场景）。
 * 适用于初始全量导入（> 10000 条记录）。
 *
 * @param ticker - 标的代码
 * @param csvStream - CSV 格式的价格数据流
 */
export async function importViaCopy(
  ticker: string,
  csvStream: NodeJS.ReadableStream,
): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();

  // 确保标的元数据存在
  await client.query(
    `INSERT INTO tickers (ticker, category, market) VALUES ($1, $2, $3)
     ON CONFLICT (ticker) DO NOTHING`,
    [ticker, '', ''],
  );

  // 使用 COPY FROM STDIN 导入（动态 import 兼容 ESM）
  // 类型声明见 api/types/pg-copy-streams.d.ts
  const pgCopyStreams = await import('pg-copy-streams');
  const copyStream = pgCopyStreams.from(
    `COPY prices (ticker, date, open, high, low, close, volume, adjusted_close) FROM STDIN WITH (FORMAT csv)`,
  );
  // @ts-expect-error -- pg-copy-streams.from 返回 Submittable 兼容流，@types/pg 重载不匹配
  const stream = client.query(copyStream) as NodeJS.WritableStream & { rowCount?: number };

  return new Promise<number>((resolve, reject) => {
    csvStream.pipe(stream);
    stream.on('finish', () => {
      logger.info({ ticker }, '[import] COPY 导入完成');
      resolve(stream.rowCount ?? 0);
    });
    stream.on('error', (err: unknown) => {
      reject(err);
    });
  }).finally(() => {
    client.release();
  });
}

/**
 * 检查数据库是否已有数据
 */
export async function hasData(): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM tickers');
  return (rows[0] as { count: string }).count !== '0';
}

// ---------------------------------------------------------------------------
// 指数 / CPI / 汇率 数据导入（从 JSON 文件迁移到 PostgreSQL）
// ---------------------------------------------------------------------------

const INDICES_DIR = path.join(DATA_DIR, 'indices');
const CPI_DIR = path.join(DATA_DIR, 'cpi');
const EXCHANGE_RATES_DIR = path.join(DATA_DIR, 'exchange_rates');

interface IndexPriceRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close?: number;
  volume?: number;
  dividend?: number;
  split_factor?: number;
}

interface IndexMeta {
  ticker: string;
  name: string;
  market: string;
  exchange: string;
}

/** 读取指数元数据文件，若不存在则返回默认值 */
function readIndexMeta(metaPath: string, ticker: string): IndexMeta {
  if (!fs.existsSync(metaPath)) return { ticker, name: ticker, market: '', exchange: '' };
  const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return {
    ticker: metaRaw.ticker || ticker,
    name: metaRaw.name || ticker,
    market: metaRaw.market || '',
    exchange: metaRaw.exchange || '',
  };
}

/** 导入单个指数文件到数据库（含事务） */
async function importSingleIndex(
  file: string,
): Promise<{ ok: boolean; ticker: string; priceCount: number }> {
  const ticker = file.replace('.json', '');
  const filePath = path.join(INDICES_DIR, file);
  const metaPath = path.join(INDICES_DIR, file.replace('.json', '.meta.json'));

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const prices: IndexPriceRecord[] = raw.prices || raw;
  if (!Array.isArray(prices) || prices.length === 0) return { ok: false, ticker, priceCount: 0 };

  const meta = readIndexMeta(metaPath, ticker);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tickers (ticker, category, market) VALUES ($1, $2, $3)
       ON CONFLICT (ticker) DO UPDATE SET updated_at = NOW()`,
      [meta.ticker, meta.name, meta.exchange],
    );
    for (const p of prices) {
      await client.query(
        `INSERT INTO prices (ticker, date, open, high, low, close, volume, adjusted_close)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (ticker, date) DO UPDATE SET
           open = EXCLUDED.open,
           high = EXCLUDED.high,
           low = EXCLUDED.low,
           close = EXCLUDED.close,
           volume = EXCLUDED.volume,
           adjusted_close = EXCLUDED.adjusted_close`,
        [
          meta.ticker,
          p.date,
          p.open,
          p.high,
          p.low,
          p.close,
          p.volume ?? null,
          p.adj_close ?? null,
        ],
      );
    }
    await client.query('COMMIT');
    logger.info({ ticker: meta.ticker, priceCount: prices.length }, '[import] 指数导入成功');
    return { ok: true, ticker: meta.ticker, priceCount: prices.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 导入指数数据到 prices 表
 *
 * 指数 JSON 格式: { prices: [{date, open, high, low, close, adj_close, volume, ...}] }
 * 元数据从对应的 .meta.json 文件读取
 */
export async function importIndices(): Promise<{ imported: number; errors: number }> {
  const t0 = Date.now();
  const result = { imported: 0, errors: 0 };

  if (!fs.existsSync(INDICES_DIR)) {
    logger.warn({ path: INDICES_DIR }, '[import] 指数数据目录不存在');
    return result;
  }

  const files = fs
    .readdirSync(INDICES_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'));
  logger.info({ totalFiles: files.length }, '[import] 指数数据导入开始');

  for (const file of files) {
    try {
      const { ok } = await importSingleIndex(file);
      if (ok) result.imported++;
      else result.errors++;
    } catch (err) {
      result.errors++;
      logger.error({ err, ticker: file.replace('.json', '') }, '[import] 指数导入失败');
    }
  }

  logger.info({ ...result, durationMs: Date.now() - t0 }, '[import] 指数数据导入完成');
  return result;
}

/**
 * 导入 CPI 数据到 cpi_data 表
 *
 * CPI JSON 格式: [{date, value}, ...]
 * 文件名格式: {country}_cpi.json（如 us_cpi.json, cn_cpi.json）
 */
export async function importCpiData(): Promise<{ imported: number; errors: number }> {
  const t0 = Date.now();
  const result = { imported: 0, errors: 0 };

  if (!fs.existsSync(CPI_DIR)) {
    logger.warn({ path: CPI_DIR }, '[import] CPI 数据目录不存在');
    return result;
  }

  const files = fs.readdirSync(CPI_DIR).filter((f) => f.endsWith('.json'));
  logger.info({ totalFiles: files.length }, '[import] CPI 数据导入开始');

  for (const file of files) {
    const country = file.replace('_cpi.json', '').toUpperCase();
    try {
      const filePath = path.join(CPI_DIR, file);
      const data: Array<{ date: string; value: number }> = JSON.parse(
        fs.readFileSync(filePath, 'utf-8'),
      );

      if (!Array.isArray(data) || data.length === 0) {
        result.errors++;
        continue;
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        for (const item of data) {
          await client.query(
            `INSERT INTO cpi_data (country, date, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (country, date) DO UPDATE SET value = EXCLUDED.value`,
            [country, item.date, item.value],
          );
        }

        await client.query('COMMIT');
        result.imported++;
        logger.info({ country, dataCount: data.length }, '[import] CPI 导入成功');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.errors++;
      logger.error({ err, country }, '[import] CPI 导入失败');
    }
  }

  logger.info({ ...result, durationMs: Date.now() - t0 }, '[import] CPI 数据导入完成');
  return result;
}

/**
 * 导入汇率数据到 exchange_rates 表
 *
 * 汇率 JSON 格式: { "YYYY-MM-DD": rate, ... }
 * 文件名格式: {base}_{target}.json（如 usd_cny.json）
 */
export async function importExchangeRates(): Promise<{ imported: number; errors: number }> {
  const t0 = Date.now();
  const result = { imported: 0, errors: 0 };

  if (!fs.existsSync(EXCHANGE_RATES_DIR)) {
    logger.warn({ path: EXCHANGE_RATES_DIR }, '[import] 汇率数据目录不存在');
    return result;
  }

  const files = fs.readdirSync(EXCHANGE_RATES_DIR).filter((f) => f.endsWith('.json'));
  logger.info({ totalFiles: files.length }, '[import] 汇率数据导入开始');

  for (const file of files) {
    const parts = file.replace('.json', '').split('_');
    if (parts.length !== 2) {
      result.errors++;
      logger.warn({ file }, '[import] 汇率文件名格式不正确，应为 {base}_{target}.json');
      continue;
    }
    const baseCurrency = parts[0].toUpperCase();
    const targetCurrency = parts[1].toUpperCase();

    try {
      const filePath = path.join(EXCHANGE_RATES_DIR, file);
      const data: Record<string, number> = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const entries = Object.entries(data);
      if (entries.length === 0) {
        result.errors++;
        continue;
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Perf (T-17b)：批量 upsert，避免逐行 INSERT（N+1）。
        await upsertExchangeRatesBatched(client, baseCurrency, targetCurrency, entries);

        await client.query('COMMIT');
        result.imported++;
        logger.info(
          { baseCurrency, targetCurrency, dataCount: entries.length },
          '[import] 汇率导入成功',
        );
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.errors++;
      logger.error({ err, file }, '[import] 汇率导入失败');
    }
  }

  logger.info({ ...result, durationMs: Date.now() - t0 }, '[import] 汇率数据导入完成');
  return result;
}

/**
 * 导入所有市场数据（指数 + CPI + 汇率）
 *
 * 企业理由：将 JSON 文件中的数值数据迁移到 PostgreSQL，
 * 消除对文件系统的依赖，支持多实例水平扩展（ADR-007）。
 * 幂等设计：ON CONFLICT DO UPDATE，可重复执行。
 */
export async function importAllMarketData(): Promise<void> {
  logger.info('[import] 开始导入全部市场数据');

  // Perf (T-17)：三类导入相互独立（指数/CPI/汇率，无数据依赖），并行执行缩短总时长。
  // 各自内部使用独立连接与事务，互不干扰；任一失败不影响其他（Promise.all 会传播首个拒绝，
  // 但每个导入函数内部已 try/catch 单文件错误，不会因单条数据中断整体）。
  const [indexResult, cpiResult, fxResult] = await Promise.all([
    importIndices(),
    importCpiData(),
    importExchangeRates(),
  ]);

  logger.info(
    {
      indices: indexResult,
      cpi: cpiResult,
      exchangeRates: fxResult,
    },
    '[import] 全部市场数据导入完成',
  );
}
