// scripts/verify/C-024-webhook-encryption.mjs
// C-024: Webhook secret 加密验证
// 智能体 A 自承"DB 已更新，应用层未实现"。
// 验证：
//   - DB 层：webhook_endpoints 表 secret 列类型（应为 bytea 而非 text）
//   - 应用层：webhookService.ts 是否有 encrypt/decrypt 调用
//   - 是否有 envelopeEncryption.ts
//   - 是否引用 pgcrypto
//   - 单测是否存在
import { writeResult, withDb, fileExists, readFileContent, grepInCode } from './_lib.mjs';

const WEBHOOK_SVC_PATH = 'packages/backend/src/application/webhookService.ts';
const ENVELOPE_ENC_PATH = 'packages/backend/src/utils/envelopeEncryption.ts';
const EXPECTED_TEST_PATHS = [
  'tests/unit/services/webhookService.encryption.test.ts',
  'tests/unit/application/webhookService.encryption.test.ts',
  'tests/unit/application/webhookService.test.ts',
  'tests/unit/services/webhookService.test.ts',
];
const MIGRATION_021_PATH = 'migrations/021_webhooks.sql';

let result;
try {
  result = await (async () => {
    // === DB 层：webhook_endpoints.secret 列类型 ===
    let dbLayer = { status: 'UNKNOWN', details: {} };
    try {
      await withDb(async (db) => {
        const colsRes = await db.query(`
          SELECT column_name, data_type, udt_name, character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'webhook_endpoints'
            AND column_name IN ('secret', 'secret_encrypted', 'secret_iv', 'secret_tag', 'secret_kid')
          ORDER BY column_name
        `);
        const cols = colsRes.rows;
        dbLayer.details.columns = cols;

        const secretCol = cols.find((c) => c.column_name === 'secret');
        if (!secretCol) {
          dbLayer.status = 'FAIL';
          dbLayer.details.error = 'webhook_endpoints.secret 列不存在';
        } else if (secretCol.data_type === 'bytea') {
          dbLayer.status = 'PASS';
          dbLayer.details.secretType = 'bytea';
        } else if (secretCol.data_type === 'text' || secretCol.data_type === 'character varying') {
          dbLayer.status = 'FAIL';
          dbLayer.details.secretType = secretCol.data_type;
          dbLayer.details.reason = 'secret 列为明文文本类型，未加密存储';
        } else {
          dbLayer.status = 'NEEDS_MANUAL_REVIEW';
          dbLayer.details.secretType = secretCol.data_type;
        }

        // 同时检查是否有配套的 IV/tag/kid 列
        const hasIv = cols.some((c) => c.column_name === 'secret_iv');
        const hasTag = cols.some((c) => c.column_name === 'secret_tag');
        const hasKid = cols.some((c) => c.column_name === 'secret_kid');
        dbLayer.details.hasIvColumn = hasIv;
        dbLayer.details.hasTagColumn = hasTag;
        dbLayer.details.hasKidColumn = hasKid;
      });
    } catch (e) {
      dbLayer.status = 'SKIP';
      dbLayer.details.error = `DB 连接失败: ${e.message}`;
    }

    // === 迁移文件 021_webhooks.sql 是否定义了 bytea secret ===
    let migrationLayer = { status: 'UNKNOWN', details: {} };
    if (fileExists(MIGRATION_021_PATH)) {
      const sql = readFileContent(MIGRATION_021_PATH);
      const secretBytea = /secret\s+bytea/i.test(sql);
      const secretText = /secret\s+(text|varchar)/i.test(sql);
      const usesPgcrypto = /pgcrypto|pgp_sym_encrypt|pgp_sym_decrypt/i.test(sql);
      migrationLayer.details = { secretBytea, secretText, usesPgcrypto };
      if (secretBytea && !secretText) migrationLayer.status = 'PASS';
      else if (secretText) migrationLayer.status = 'FAIL';
      else migrationLayer.status = 'NEEDS_MANUAL_REVIEW';
    } else {
      migrationLayer.status = 'SKIP';
      migrationLayer.details.error = '021_webhooks.sql 不存在';
    }

    // === 应用层：webhookService.ts 是否调用 encrypt/decrypt ===
    let appLayer = { status: 'UNKNOWN', details: {} };
    if (fileExists(WEBHOOK_SVC_PATH)) {
      const src = readFileContent(WEBHOOK_SVC_PATH);
      const hasEncrypt = /\bencrypt\b/i.test(src);
      const hasDecrypt = /\bdecrypt\b/i.test(src);
      const importsEnvelope = /from\s+['"][^'"]*envelopeEncryption(?:\.js)?['"]/.test(src);
      const importsCrypto = /from\s+['"][^'"]*\/crypto['"]/.test(src);
      const pgcryptoCall = /pgp_sym_(encrypt|decrypt)/i.test(src);
      appLayer.details = {
        hasEncryptCall: hasEncrypt,
        hasDecryptCall: hasDecrypt,
        importsEnvelopeEncryption: importsEnvelope,
        importsCryptoUtil: importsCrypto,
        pgcryptoCall,
        srcLength: src.length,
      };
      // 判定：必须同时有 encrypt 和 decrypt 调用，并引用 envelopeEncryption 或 crypto
      if (hasEncrypt && hasDecrypt && (importsEnvelope || importsCrypto)) {
        appLayer.status = 'PASS';
      } else {
        appLayer.status = 'FAIL';
        appLayer.details.reason = 'webhookService 未调用 encrypt/decrypt 或未引入加密工具';
      }
    } else {
      appLayer.status = 'FAIL';
      appLayer.details.error = `${WEBHOOK_SVC_PATH} 不存在`;
    }

    // === envelopeEncryption.ts 是否存在 ===
    const envelopeEncExists = fileExists(ENVELOPE_ENC_PATH);
    let envelopeLayer = { status: envelopeEncExists ? 'PASS' : 'FAIL', details: { path: ENVELOPE_ENC_PATH, exists: envelopeEncExists } };
    if (envelopeEncExists) {
      const envSrc = readFileContent(ENVELOPE_ENC_PATH);
      envelopeLayer.details.hasEncryptFn = /export\s+(async\s+)?function\s+encrypt\b|export\s+const\s+encrypt\b/.test(envSrc);
      envelopeLayer.details.hasDecryptFn = /export\s+(async\s+)?function\s+decrypt\b|export\s+const\s+decrypt\b/.test(envSrc);
      envelopeLayer.details.usesAesGcm = /aes-256-gcm|createCipheriv|createDecipheriv/i.test(envSrc);
      envelopeLayer.details.srcLength = envSrc.length;
    }

    // === pgcrypto 引用（整个 backend/src） ===
    const pgcryptoRefs = grepInCode(/pgcrypto|pgp_sym_(encrypt|decrypt)/i, 'packages/backend/src', {
      extensions: ['.ts', '.js', '.mjs', '.sql'],
    });
    const pgcryptoLayer = {
      status: pgcryptoRefs.length > 0 ? 'PASS' : 'FAIL',
      details: { refsCount: pgcryptoRefs.length, refs: pgcryptoRefs.slice(0, 20) },
    };

    // === 单测存在性 ===
    const testFileStatus = EXPECTED_TEST_PATHS.map((p) => ({ path: p, exists: fileExists(p) }));
    const hasDedicatedEncTest = testFileStatus.some(
      (t) => t.exists && /encryption/.test(t.path)
    );
    const hasAnyWebhookTest = testFileStatus.some((t) => t.exists);
    const testLayer = {
      status: hasDedicatedEncTest ? 'PASS' : (hasAnyWebhookTest ? 'NEEDS_MANUAL_REVIEW' : 'FAIL'),
      details: {
        expectedPaths: EXPECTED_TEST_PATHS,
        testFileStatus,
        hasDedicatedEncryptionTest: hasDedicatedEncTest,
        hasAnyWebhookTest,
      },
    };

    // === 综合 ===
    const overallPass =
      dbLayer.status === 'PASS' &&
      migrationLayer.status === 'PASS' &&
      appLayer.status === 'PASS' &&
      envelopeLayer.status === 'PASS' &&
      testLayer.status === 'PASS';

    return {
      status: overallPass ? 'PASS' : 'FAIL',
      summary: `db=${dbLayer.status}, migration=${migrationLayer.status}, app=${appLayer.status}, envelope=${envelopeLayer.status}, pgcrypto=${pgcryptoLayer.status}, tests=${testLayer.status}`,
      details: {
        dbLayer,
        migrationLayer,
        appLayer,
        envelopeLayer,
        pgcryptoLayer,
        testLayer,
      },
    };
  })();
} catch (e) {
  result = {
    status: 'FAIL',
    summary: `脚本异常: ${e.message}`,
    details: { error: e.message, stack: e.stack },
  };
}

writeResult('C-024', result);
process.exit(0);
