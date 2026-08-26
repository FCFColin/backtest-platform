/**
 * PostgreSQL Schema 迁移管理（ADR-002，forward-only，见 ADR-018）。
 * 迁移 SQL 已重基线为单个 001_initial_schema.sql（45 个历史迁移合并）。
 * 回滚走备份恢复（scripts/backup-restore.sh），不做 down 迁移。
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from './pool.js';

const MIGRATIONS_DIR = config.MIGRATIONS_DIR;

/** 会话级 advisory lock 键：多实例并发迁移互斥（同一连接内可重入）。 */
const MIGRATION_LOCK_ID = 725449110;

function readMigrationFile(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}

export const migrations: Array<{ version: number; upFile: string }> = [
  { version: 1, upFile: '001_initial_schema.sql' },
  { version: 2, upFile: '002_fama_french_factors.sql' },
  { version: 3, upFile: '003_platform_rls_escape.sql' },
  { version: 4, upFile: '004_remove_dead_schema.sql' },
  { version: 5, upFile: '005_remove_dead_schema.sql' },
  { version: 6, upFile: '006_audit_outbox_idempotency.sql' },
  { version: 7, upFile: '007_outbox_notify_trigger.sql' },
  { version: 8, upFile: '008_outbox_attempts.sql' },
  { version: 9, upFile: '009_treasury_rates.sql' },
];

export async function initSchema(): Promise<void> {
  const client = await getPool().connect();
  const t0 = Date.now();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        description TEXT
      );
    `);
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set(rows.map((r: { version: number }) => r.version));
    const pending = migrations.filter((m) => !appliedVersions.has(m.version));
    if (pending.length === 0) {
      logger.info({}, '[db] Schema 已是最新');
      return;
    }
    logger.info(
      { targetVersion: migrations[migrations.length - 1].version },
      '[db] Schema 迁移开始',
    );
    for (const m of pending) {
      const sql = readMigrationFile(m.upFile);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, version: m.version }, `[db] Schema v${m.version} 迁移失败`);
        throw err;
      }
    }
    logger.info({ durationMs: Date.now() - t0 }, '[db] Schema 迁移完成');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    client.release();
  }
}
