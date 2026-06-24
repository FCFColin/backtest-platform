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
