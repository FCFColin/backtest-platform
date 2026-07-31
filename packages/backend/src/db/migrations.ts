/**
 * PostgreSQL Schema 迁移管理（ADR-007）。
 * 迁移 SQL 提取到 migrations/ 独立文件，便于 DBA 审查与 CI 回滚测试。
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from './pool.js';

const MIGRATIONS_DIR = config.MIGRATIONS_DIR;

/** 读取 migrations/ 目录的 SQL 文件内容。 */
function readMigrationFile(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}

/** 从 SQL 文件提取 `-- 描述：xxx` 行作为迁移描述。 */
function extractDescription(sql: string): string {
  const match = sql.match(/^-- 描述：(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * 迁移注册表：downFile 由 upFile 派生（{name}_down.sql），版本号从 1 递增。
 * version 28 已废弃（028_announcements 与 029 schema 冲突，保留 029；原 028_custom_tickers 重编号为 030）。
 */
const migrations: Array<{ version: number; upFile: string; downFile: string }> = (
  [
    [1, '001_init.sql'], [2, '002_fts.sql'], [3, '003_index_cleanup.sql'],
    [4, '004_users.sql'], [5, '005_outbox.sql'], [6, '006_outbox_dedup.sql'],
    [7, '007_least_privilege.sql'], [8, '008_checks.sql'], [9, '009_tenancy.sql'],
    [10, '010_user_email.sql'], [11, '011_billing.sql'], [12, '012_usage.sql'],
    [13, '013_drop_redundant_index.sql'], [14, '014_drop_chk_prices_volume_nonnegative.sql'],
    [15, '015_add_exchange_column.sql'], [16, '016_backtest_progress.sql'],
    [17, '017_admin_api_key_db.sql'], [18, '018_timescaledb.sql'],
    [19, '019_security_compliance.sql'], [20, '020_custom_rbac.sql'],
    [21, '021_webhooks.sql'], [22, '022_audit_storage.sql'], [23, '023_cagg_backfill.sql'],
    [24, '024_rls_extension.sql'], [25, '025_audit_chain.sql'], [26, '026_tactical_configs.sql'],
    [27, '027_timescale_cagg.sql'], [28, '028_placeholder.sql'], [29, '029_announcements.sql'],
    [30, '030_custom_tickers.sql'], [31, '031_force_rls.sql'],
    [32, '032_enable_rls_api_keys_invitations.sql'], [33, '033_backtest_app_grants.sql'],
    [34, '034_webhook_secret_encrypt.sql'], [35, '035_prices_hypertable.sql'],
    [36, '036_audit_logs.sql'], [37, '037_invitations_rls.sql'],
    [38, '038_backtest_runs_default_status.sql'], [39, '039_prices_numeric.sql'],
    [40, '040_fk_indexes.sql'], [41, '041_drop_redundant_indexes.sql'],
    [42, '042_updated_at_triggers.sql'], [43, '043_api_keys_hash_check.sql'],
    [44, '044_user_roles_role_id_idx.sql'], [45, '045_financial_numeric_cutover.sql'],
  ] as Array<[number, string]>
).map(([version, upFile]) => ({ version, upFile, downFile: upFile.replace('.sql', '_down.sql') }));

/** 初始化数据库 schema（执行未应用的迁移）。 */
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
    const pendingMigrations = migrations.filter((m) => !appliedVersions.has(m.version));
    const currentVersion = appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0;
    const targetVersion = migrations[migrations.length - 1].version;

    if (pendingMigrations.length === 0) {
      logger.info({ currentVersion }, '[db] Schema 已是最新，无需迁移');
      return;
    }

    logger.info({ currentVersion, targetVersion }, '[db] Schema 迁移开始');

    for (const m of pendingMigrations) {
      const sql = readMigrationFile(m.upFile);
      const description = extractDescription(sql);
      logger.info({ version: m.version, description }, '[db] 执行迁移');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, description) VALUES ($1, $2)', [m.version, description]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, version: m.version }, `[db] Schema v${m.version} 迁移失败`);
        throw err;
      }
    }

    logger.info({ fromVersion: currentVersion, toVersion: targetVersion, durationMs: Date.now() - t0 }, '[db] Schema 迁移完成');
  } finally {
    client.release();
  }
}

/** 回滚指定版本以上的迁移。 */
export async function rollbackSchema(targetVersion: number): Promise<void> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version DESC');
    const appliedVersions = rows.map((r: { version: number }) => r.version);
    const toRollback = migrations.filter((m) => appliedVersions.includes(m.version) && m.version > targetVersion);

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
