/**
 * 宏观数据（CPI / 汇率）PostgreSQL 读取
 */
import { getReadPool } from './index.js';
import { logger } from '../utils/logger.js';

function formatDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const cpiMapCache: Record<string, Record<string, number>> = {};
const exchangeRateCache: Record<string, Record<string, number>> = {};

/**
 * 从 PostgreSQL 加载 CPI 序列（API 响应格式）
 *
 * @param country - `us` 或 `cn`
 * @returns `{ date, value }[]`；无数据时返回空数组
 */
export async function loadCpiSeriesFromDb(
  country: string,
): Promise<Array<{ date: string; value: number }>> {
  try {
    const pool = getReadPool();
    const countryCode = country.toLowerCase() === 'cn' ? 'CN' : 'US';
    const { rows } = await pool.query<{ date: Date; value: number }>(
      'SELECT date, value FROM cpi_data WHERE country = $1 ORDER BY date',
      [countryCode],
    );
    return rows.map((r) => ({ date: formatDate(r.date), value: r.value }));
  } catch (err) {
    logger.warn({ err: err as Error, country }, '[macroData] CPI 查询失败');
    return [];
  }
}

/**
 * 从 PostgreSQL 加载 CPI 映射 `{ date: value }`（回测引擎格式）
 *
 * @param country - `us` 或 `cn`
 */
export async function loadCpiMapFromDb(country: string): Promise<Record<string, number>> {
  const key = country.toLowerCase();
  if (cpiMapCache[key]) return cpiMapCache[key];

  const series = await loadCpiSeriesFromDb(key);
  const map: Record<string, number> = {};
  for (const item of series) map[item.date] = item.value;
  cpiMapCache[key] = map;
  return map;
}

/**
 * 从 PostgreSQL 加载汇率映射 `{ date: rate }`
 *
 * @param base - 基准货币（默认 USD）
 * @param target - 目标货币（默认 CNY）
 */
export async function loadExchangeRatesFromDb(
  base = 'USD',
  target = 'CNY',
): Promise<Record<string, number>> {
  const cacheKey = `${base}_${target}`;
  if (exchangeRateCache[cacheKey]) return exchangeRateCache[cacheKey];

  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{ date: Date; rate: number }>(
      `SELECT date, rate FROM exchange_rates
       WHERE base_currency = $1 AND target_currency = $2
       ORDER BY date`,
      [base.toUpperCase(), target.toUpperCase()],
    );
    const map: Record<string, number> = {};
    for (const row of rows) map[formatDate(row.date)] = row.rate;
    exchangeRateCache[cacheKey] = map;
    return map;
  } catch (err) {
    logger.warn({ err: err as Error, base, target }, '[macroData] 汇率查询失败');
    return {};
  }
}
