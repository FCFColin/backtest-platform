#!/usr/bin/env node
/**
 * P2-04: 审计日志链式完整性验证脚本
 *
 * 定期运行（如 cron 每小时），验证 audit_logs 表中链式 hash 的完整性。
 * 发现断裂点时输出详细日志并以 exit code 1 退出（供监控告警）。
 *
 * 用法：
 *   npx tsx scripts/verify-audit-chain.ts
 *   # 或配置为定时任务
 */

import { verifyAuditChain } from '../packages/backend/src/application/auditStorageService.js';
import { closeDb } from '../packages/backend/src/db/pool.js';
import { logger } from '../packages/backend/src/utils/logger.js';

async function main(): Promise<void> {
  try {
    logger.info('[verify-audit-chain] 开始链式完整性校验...');
    const result = await verifyAuditChain();

    if (result.valid) {
      logger.info(
        { totalChecked: result.totalChecked },
        '[verify-audit-chain] 链式完整性校验通过，无断裂点',
      );
      process.exit(0);
    } else {
      logger.error(
        {
          totalChecked: result.totalChecked,
          brokenLinks: result.brokenLinks.length,
          firstBroken: result.brokenLinks[0],
        },
        '[verify-audit-chain] 链式完整性校验失败！发现断裂点',
      );
      process.exit(1);
    }
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      '[verify-audit-chain] 脚本执行异常',
    );
    process.exit(2);
  } finally {
    await closeDb();
  }
}

void main();
