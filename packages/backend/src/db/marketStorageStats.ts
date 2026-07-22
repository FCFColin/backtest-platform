/**
 * 市场数据 PostgreSQL 表空间占用统计。
 */
import { getReadPool } from './pool.js';
import { logger } from '../utils/logger.js';

const MARKET_DATA_TABLES = ['tickers', 'prices', 'cpi_data', 'exchange_rates'] as const;

/**
 * 查询行情相关 PostgreSQL 表的实际磁盘占用（含 TOAST 与索引）。
 *
 * @returns 字节数；查询失败时返回 0
 */
export async function getMarketDataStorageBytes(): Promise<number> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{ total_bytes: string }>(
      `SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(c.relname)::regclass)), 0)::text AS total_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])`,
      [MARKET_DATA_TABLES],
    );
    return parseInt(rows[0]?.total_bytes ?? '0', 10) || 0;
  } catch (err) {
    logger.warn({ err: err as Error }, '[marketStats] 查询 PostgreSQL 表空间失败');
    return 0;
  }
}

/**
 * 将字节数转为 MB（保留 1 位小数）。
 *
 * @param bytes 字节数
 * @returns 对应的 MB 数值（保留 1 位小数）
 */
export function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
