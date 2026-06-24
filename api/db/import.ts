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
import { getPool, getClient } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../../data/market');
const TICKERS_DIR = path.join(DATA_DIR, 'tickers');

interface PriceRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

/**
 * 导入所有标的的价格数据（PostgreSQL 版本）
 *
 * 使用参数化 INSERT（防 SQL 注入），每个标的一个事务。
 * 对于大规模导入（> 10000 条），建议使用 COPY 命令。
 */
export async function importAllTickers(): Promise<{ imported: number; skipped: number; errors: number }> {
  const t0 = Date.now();
  const pool = getPool();
  const result = { imported: 0, skipped: 0, errors: 0 };

  if (!fs.existsSync(TICKERS_DIR)) {
    logger.warn({ path: TICKERS_DIR }, '[import] 标的数据目录不存在');
    return result;
  }

  const files = fs.readdirSync(TICKERS_DIR).filter(f => f.endsWith('.json'));
  logger.info({ totalFiles: files.length }, '[import] 数据导入开始');

  for (const file of files) {
    const ticker = file.replace('.json', '');
    try {
      const filePath = path.join(TICKERS_DIR, file);
      const data: PriceRecord[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      if (!Array.isArray(data) || data.length === 0) {
        result.skipped++;
        continue;
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        // 插入/更新标的元数据
        await client.query(
          `INSERT INTO tickers (ticker, category, market) VALUES ($1, $2, $3)
           ON CONFLICT (ticker) DO UPDATE SET updated_at = NOW()`,
          [ticker, '', '']
        );

        // 批量插入价格数据（ON CONFLICT 更新）
        for (const p of data) {
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
            [ticker, p.date, p.open, p.high, p.low, p.close, p.volume, p.adjustedClose ?? null]
          );
        }

        await client.query('COMMIT');
        result.imported++;
        logger.info({ ticker, priceCount: data.length }, '[import] 标的导入成功');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.errors++;
      logger.error({ err, ticker }, '[import] 导入失败');
    }
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
    [ticker, '', '']
  );

  // 使用 COPY FROM STDIN 导入（动态 import 兼容 ESM）
  // @ts-expect-error -- pg-copy-streams 无类型声明，动态 import 在运行时解析
  const pgCopyStreams = await import('pg-copy-streams') as any;
  const stream = client.query(
    pgCopyStreams.from(
      `COPY prices (ticker, date, open, high, low, close, volume, adjusted_close) FROM STDIN WITH (FORMAT csv)`
    )
  );

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

  const files = fs.readdirSync(INDICES_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.meta.json'));
  logger.info({ totalFiles: files.length }, '[import] 指数数据导入开始');

  for (const file of files) {
    const ticker = file.replace('.json', '');
    try {
      const filePath = path.join(INDICES_DIR, file);
      const metaPath = path.join(INDICES_DIR, file.replace('.json', '.meta.json'));

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const prices: IndexPriceRecord[] = raw.prices || raw;

      if (!Array.isArray(prices) || prices.length === 0) {
        result.errors++;
        continue;
      }

      // 读取元数据
      let meta: IndexMeta = { ticker, name: ticker, market: '', exchange: '' };
      if (fs.existsSync(metaPath)) {
        const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        meta = {
          ticker: metaRaw.ticker || ticker,
          name: metaRaw.name || ticker,
          market: metaRaw.market || '',
          exchange: metaRaw.exchange || '',
        };
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO tickers (ticker, category, market) VALUES ($1, $2, $3)
           ON CONFLICT (ticker) DO UPDATE SET updated_at = NOW()`,
          [meta.ticker, meta.name, meta.exchange]
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
            [meta.ticker, p.date, p.open, p.high, p.low, p.close, p.volume ?? null, p.adj_close ?? null]
          );
        }

        await client.query('COMMIT');
        result.imported++;
        logger.info({ ticker: meta.ticker, priceCount: prices.length }, '[import] 指数导入成功');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.errors++;
      logger.error({ err, ticker }, '[import] 指数导入失败');
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

  const files = fs.readdirSync(CPI_DIR).filter(f => f.endsWith('.json'));
  logger.info({ totalFiles: files.length }, '[import] CPI 数据导入开始');

  for (const file of files) {
    const country = file.replace('_cpi.json', '').toUpperCase();
    try {
      const filePath = path.join(CPI_DIR, file);
      const data: Array<{ date: string; value: number }> = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

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
            [country, item.date, item.value]
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

  const files = fs.readdirSync(EXCHANGE_RATES_DIR).filter(f => f.endsWith('.json'));
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

        for (const [date, rate] of entries) {
          await client.query(
            `INSERT INTO exchange_rates (base_currency, target_currency, date, rate)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (base_currency, target_currency, date) DO UPDATE SET rate = EXCLUDED.rate`,
            [baseCurrency, targetCurrency, date, rate]
          );
        }

        await client.query('COMMIT');
        result.imported++;
        logger.info({ baseCurrency, targetCurrency, dataCount: entries.length }, '[import] 汇率导入成功');
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

  const indexResult = await importIndices();
  const cpiResult = await importCpiData();
  const fxResult = await importExchangeRates();

  logger.info({
    indices: indexResult,
    cpi: cpiResult,
    exchangeRates: fxResult,
  }, '[import] 全部市场数据导入完成');
}
