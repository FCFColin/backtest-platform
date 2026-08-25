// P0-03: cpi_data / exchange_rates 为全局共享宏观数据，无 tenant_id，不启用 RLS
import { getReadPool } from './pool.js';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/misc.js';

// Map 保持插入序便于 FIFO 淘汰，防止任意 base/target 组合撑爆内存；TTL 防止宏观数据长期陈旧
const CACHE_MAX_ENTRIES = 100;
const CACHE_TTL_MS = 60 * 60 * 1000;
const exchangeRateCache = new Map<string, { data: Record<string, number>; ts: number }>();

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
    return rows.map((r) => ({ date: toDateStr(r.date), value: r.value }));
  } catch (err) {
    logger.warn({ err: err as Error, country }, '[macroData] CPI 查询失败');
    return [];
  }
}

// U-2 Phase 2：无风险利率序列（treasury_rates，全局共享宏观数据，无 RLS）
export async function loadTreasurySeriesFromDb(
  series: string,
): Promise<Array<{ date: string; rate: number }>> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{ date: Date; rate: number }>(
      'SELECT date, rate FROM treasury_rates WHERE series = $1 ORDER BY date',
      [series.toUpperCase()],
    );
    return rows.map((r) => ({ date: toDateStr(r.date), rate: r.rate }));
  } catch (err) {
    logger.warn({ err: err as Error, series }, '[macroData] 利率序列查询失败');
    return [];
  }
}

export async function loadExchangeRatesFromDb(
  base = 'USD',
  target = 'CNY',
): Promise<Record<string, number>> {
  const cacheKey = `${base}_${target}`;
  const cached = exchangeRateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{ date: Date; rate: number }>(
      `SELECT date, rate FROM exchange_rates
       WHERE base_currency = $1 AND target_currency = $2
       ORDER BY date`,
      [base.toUpperCase(), target.toUpperCase()],
    );
    const map: Record<string, number> = {};
    for (const row of rows) map[toDateStr(row.date)] = row.rate;
    exchangeRateCache.set(cacheKey, { data: map, ts: Date.now() });
    if (exchangeRateCache.size > CACHE_MAX_ENTRIES) {
      const oldest = exchangeRateCache.keys().next().value;
      if (oldest) exchangeRateCache.delete(oldest);
    }
    return map;
  } catch (err) {
    logger.warn({ err: err as Error, base, target }, '[macroData] 汇率查询失败');
    return {};
  }
}
