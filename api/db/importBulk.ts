import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getPool } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TICKERS_DIR = path.resolve(__dirname, '../../data/market/tickers');

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

const CONCURRENCY = 5;

async function importSingleTickerViaCopy(
  pool: pg.Pool,
  ticker: string,
  data: PriceRecord[],
): Promise<void> {
  const csvBuffer: string[] = [];
  for (const p of data) {
    const adj = p.adj_close ?? p.adjustedClose ?? '';
    csvBuffer.push(
      `${ticker},${p.date},${p.open},${p.high},${p.low},${p.close},${p.volume},${adj}`,
    );
  }
  const csvStr = csvBuffer.join('\n') + '\n';

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO tickers (ticker, category, market) VALUES ($1, '', '') ON CONFLICT (ticker) DO UPDATE SET updated_at = NOW()`,
      [ticker],
    );
    const pgCopyStreams = await import('pg-copy-streams');
    const copyStream = pgCopyStreams.from(
      'COPY prices (ticker, date, open, high, low, close, volume, adjusted_close) FROM STDIN WITH (FORMAT csv)',
    );
    // @ts-expect-error -- pg-copy-streams.from 返回 Submittable 兼容流，@types/pg 重载不匹配
    const stream = client.query(copyStream) as unknown as NodeJS.WritableStream & {
      rowCount?: number;
    };
    stream.write(csvStr);
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (err: unknown) => reject(err));
    });
  } finally {
    client.release();
  }
}

async function worker(
  pool: pg.Pool,
  files: string[],
  progress: { done: number; total: number; rows: number; errors: number },
): Promise<void> {
  for (const file of files) {
    const ticker = file.replace('.json', '');
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(TICKERS_DIR, file), 'utf-8'));
      const data: PriceRecord[] = Array.isArray(raw) ? raw : raw.prices || [];
      if (data.length === 0) {
        progress.done++;
        continue;
      }
      await importSingleTickerViaCopy(pool, ticker, data);
      progress.done++;
      progress.rows += data.length;
    } catch (err) {
      progress.errors++;
      if (progress.errors % 10 === 0) {
        logger.error(
          { err, ticker, done: progress.done, total: progress.total, errors: progress.errors },
          '[bulk-import] 导入失败',
        );
      }
    }
    if (progress.done % 200 === 0 || progress.done === progress.total) {
      logger.info(
        {
          done: progress.done,
          total: progress.total,
          rows: progress.rows,
          errors: progress.errors,
        },
        '[bulk-import] 进度',
      );
    }
  }
}

export async function importAllViaCopy(): Promise<void> {
  const t0 = Date.now();
  if (!fs.existsSync(TICKERS_DIR)) {
    logger.warn({ path: TICKERS_DIR }, '[bulk-import] 标的数据目录不存在');
    return;
  }

  const files = fs
    .readdirSync(TICKERS_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'));
  logger.info({ totalFiles: files.length }, '[bulk-import] 批量 COPY 导入开始');

  const pool = getPool();
  const progress = { done: 0, total: files.length, rows: 0, errors: 0 };

  const chunks: string[][] = [];
  for (let i = 0; i < files.length; i += Math.ceil(files.length / CONCURRENCY)) {
    chunks.push(files.slice(i, i + Math.ceil(files.length / CONCURRENCY)));
  }

  await Promise.all(chunks.map((chunk) => worker(pool, chunk, progress)));

  logger.info(
    {
      done: progress.done,
      total: progress.total,
      rows: progress.rows,
      errors: progress.errors,
      durationMs: Date.now() - t0,
    },
    '[bulk-import] 批量 COPY 导入完成',
  );
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  importAllViaCopy().catch((err) => {
    logger.error({ err }, '[bulk-import] 脚本异常');
    process.exit(1);
  });
}
