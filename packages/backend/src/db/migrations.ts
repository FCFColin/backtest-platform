/**
 * PostgreSQL Schema 迁移管理（ADR-007）。
 *
 * 迁移 SQL 提取到 migrations/ 独立文件，便于 DBA 审查与 CI 回滚测试。
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from './pool.js';

const MIGRATIONS_DIR = config.MIGRATIONS_DIR;

/**
 * 从 migrations/ 目录读取 SQL 文件内容
 */
function readMigrationFile(filename: string): string {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 从 SQL 文件内容中提取 `-- 描述：xxx` 行作为迁移描述
 */
function extractDescription(sql: string): string {
  const match = sql.match(/^-- 描述：(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * 迁移注册表：每个版本对应一对 up/down SQL 文件，版本号从 1 递增。
 */
const migrations: Array<{ version: number; upFile: string; downFile: string }> = [
  { version: 1, upFile: '001_init.sql', downFile: '001_init_down.sql' },
  { version: 2, upFile: '002_fts.sql', downFile: '002_fts_down.sql' },
  { version: 3, upFile: '003_index_cleanup.sql', downFile: '003_index_cleanup_down.sql' },
  { version: 4, upFile: '004_users.sql', downFile: '004_users_down.sql' },
  { version: 5, upFile: '005_outbox.sql', downFile: '005_outbox_down.sql' },
  { version: 6, upFile: '006_outbox_dedup.sql', downFile: '006_outbox_dedup_down.sql' },
  { version: 7, upFile: '007_least_privilege.sql', downFile: '007_least_privilege_down.sql' },
  { version: 8, upFile: '008_checks.sql', downFile: '008_checks_down.sql' },
  { version: 9, upFile: '009_tenancy.sql', downFile: '009_tenancy_down.sql' },
  { version: 10, upFile: '010_user_email.sql', downFile: '010_user_email_down.sql' },
  { version: 11, upFile: '011_billing.sql', downFile: '011_billing_down.sql' },
  { version: 12, upFile: '012_usage.sql', downFile: '012_usage_down.sql' },
  {
    version: 13,
    upFile: '013_drop_redundant_index.sql',
    downFile: '013_drop_redundant_index_down.sql',
  },
  {
    version: 14,
    upFile: '014_drop_chk_prices_volume_nonnegative.sql',
    downFile: '014_drop_chk_prices_volume_nonnegative_down.sql',
  },
  {
    version: 15,
    upFile: '015_add_exchange_column.sql',
    downFile: '015_add_exchange_column_down.sql',
  },
];

/**
 * 初始化数据库 schema（执行未应用的迁移）
 */
export async function initSchema(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
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

    const pendingMigrations = migrations.filter((m) => !appliedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      const currentVersion = appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0;
      logger.info({ currentVersion }, '[db] Schema 已是最新，无需迁移');
      return;
    }

    logger.info(
      {
        currentVersion: appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0,
        targetVersion: migrations[migrations.length - 1].version,
      },
      '[db] Schema 迁移开始',
    );

    for (const m of pendingMigrations) {
      const sql = readMigrationFile(m.upFile);
      const description = extractDescription(sql);
      logger.info({ version: m.version, description }, '[db] 执行迁移');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, description) VALUES ($1, $2)', [
          m.version,
          description,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, version: m.version }, `[db] Schema v${m.version} 迁移失败`);
        throw err;
      }
    }

    logger.info(
      {
        fromVersion: appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0,
        toVersion: migrations[migrations.length - 1].version,
        durationMs: Date.now() - t0,
      },
      '[db] Schema 迁移完成',
    );
  } finally {
    client.release();
  }
}

/**
 * 回滚指定版本的迁移
 */
export async function rollbackSchema(targetVersion: number): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC',
    );
    const appliedVersions = rows.map((r: { version: number }) => r.version);

    const toRollback = migrations.filter(
      (m) => appliedVersions.includes(m.version) && m.version > targetVersion,
    );

    if (toRollback.length === 0) {
      logger.info({ targetVersion }, '[db] 无需回滚');
      return;
    }

    for (const m of toRollback.sort((a, b) => b.version - a.version)) {
      const sql = readMigrationFile(m.downFile);
      const description = extractDescription(sql);
      logger.info({ version: m.version, description }, '[db] 执行回滚');

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
