/**
 * PostgreSQL Schema 迁移管理（ADR-007）。
 * 迁移 SQL 已重基线为单个 001_initial_schema.sql（45 个历史迁移合并）。
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from './pool.js';

const MIGRATIONS_DIR = config.MIGRATIONS_DIR;

function readMigrationFile(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}

const migrations: Array<{ version: number; upFile: string; downFile: string }> = [
  { version: 1, upFile: '001_initial_schema.sql', downFile: '001_initial_schema_down.sql' },
  {
    version: 2,
    upFile: '002_fama_french_factors.sql',
    downFile: '002_fama_french_factors_down.sql',
  },
  {
    version: 3,
    upFile: '003_platform_rls_escape.sql',
    downFile: '003_platform_rls_escape_down.sql',
  },
  {
    version: 4,
    upFile: '004_remove_dead_schema.sql',
    downFile: '004_remove_dead_schema_down.sql',
  },
];

export async function initSchema(): Promise<void> {
  const client = await getPool().connect();
  const t0 = Date.now();
  try {
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
    client.release();
  }
}

export async function rollbackSchema(targetVersion: number): Promise<void> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC',
    );
    const applied = rows.map((r: { version: number }) => r.version);
    const toRollback = migrations.filter(
      (m) => applied.includes(m.version) && m.version > targetVersion,
    );
    if (toRollback.length === 0) {
      logger.info({ targetVersion }, '[db] 无需回滚');
      return;
    }
    for (const m of toRollback.sort((a, b) => b.version - a.version)) {
      const sql = readMigrationFile(m.downFile);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [m.version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, version: m.version }, `[db] Schema v${m.version} 回滚失败`);
        throw err;
      }
    }
    logger.info({ targetVersion }, '[db] Schema 回滚完成');
  } finally {
    client.release();
  }
}
