#!/usr/bin/env node
// =============================================================================
// Backfill tickers.exchange 列 (Task 4.2)
//
// 遍历 tickers 表中 exchange = '' 的行，按 ticker 后缀推导 exchange：
//   _SZ / .SZ  → SZSE（深圳证券交易所）
//   _SS / .SS  → SSE（上海证券交易所）
//   _SH / .SH  → SSE（上海证券交易所）
//   其余无后缀 → US（美国市场，后续可由 data-fetcher 细化为 NASDAQ/NYSE）
//
// 安全性：仅更新 exchange = '' 的行，可安全重复运行。
// 幂等性：exchange 由 ticker 确定性推导，重复运行结果一致。
//
// 用法：
//   $env:DATABASE_URL = "postgresql://backtest:backtest@localhost:5432/backtest"
//   node scripts/backfill_exchange.mjs
// =============================================================================
// 注意：pnpm workspace 下 pg 是 @backtest/backend 的依赖，需从 backend 包解析。
// 通过 createRequire 指向 backend/package.json，避免向根 package.json 添加 pg 依赖。

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// 从 @backtest/backend 包解析 pg（pnpm workspace 依赖隔离）
const backendRequire = createRequire(resolve(projectRoot, 'packages/backend/package.json'));
const { Pool } = backendRequire('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[backfill-exchange] 错误：DATABASE_URL 环境变量未设置');
  console.error('  请先设置 DATABASE_URL，例如（PowerShell）：');
  console.error('  $env:DATABASE_URL = "postgresql://backtest:backtest@localhost:5432/backtest"');
  console.error('  node scripts/backfill_exchange.mjs');
  process.exit(1);
}

const BATCH_SIZE = 500;

/**
 * 按 ticker 后缀推导交易所代码。
 * 与 backend 的 deriveExchangeFromTicker / Go 的 provider.DeriveExchange 保持一致。
 *
 * @param {string} ticker 标的代码
 * @returns {string} 交易所代码（SZSE / SSE / US）
 */
function deriveExchange(ticker) {
  if (/[._]SZ$/i.test(ticker)) return 'SZSE';
  if (/[._](SS|SH)$/i.test(ticker)) return 'SSE';
  return 'US';
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  try {
    const { rows } = await pool.query(
      "SELECT ticker FROM tickers WHERE exchange = '' ORDER BY ticker",
    );
    const total = rows.length;
    if (total === 0) {
      console.log('[backfill-exchange] 无需回填：所有 tickers.exchange 均已填充');
      return;
    }
    console.log(
      `[backfill-exchange] 待回填 ${total} 行，开始批量更新（batch=${BATCH_SIZE}）...`,
    );

    let updated = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const tickers = batch.map((r) => r.ticker);
      const exchanges = batch.map((r) => deriveExchange(r.ticker));

      // 单条 UPDATE + unnest 批量绑定，避免 N 次往返；仅更新 exchange='' 的行
      const res = await pool.query(
        `UPDATE tickers AS t
         SET exchange = d.exchange
         FROM unnest($1::text[], $2::text[]) AS d(ticker, exchange)
         WHERE t.ticker = d.ticker AND t.exchange = ''`,
        [tickers, exchanges],
      );
      updated += res.rowCount ?? 0;
      console.log(`[backfill-exchange] 进度：${i + batch.length} / ${total}（本批影响 ${res.rowCount ?? 0} 行）`);
    }
    console.log(`[backfill-exchange] 完成：共更新 ${updated} 行`);

    // 打印分布汇总以便核验
    const { rows: dist } = await pool.query(
      'SELECT exchange, COUNT(*)::int AS cnt FROM tickers GROUP BY exchange ORDER BY cnt DESC',
    );
    console.log('[backfill-exchange] exchange 分布汇总：');
    for (const r of dist) {
      console.log(`  ${r.exchange || '(空)'}: ${r.cnt}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[backfill-exchange] 失败：', err);
  process.exit(1);
});
