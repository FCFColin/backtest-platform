import crypto from 'crypto';
import { config } from '../config/index.js';
import { logger } from './logger.js';

// HMAC-SHA256 审计签名/校验单一实现（auditMiddleware 与 auditStorageService 共用）；AUDIT_HMAC_KEY 缺失时降级为不签名（仅生产 validateConfig 强制），签名仅用于篡改检测不作授权凭据
export function signAuditEntry(payload: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('[auditCrypto] AUDIT_HMAC_KEY not set, audit log signing disabled');
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}
export function verifyAuditEntry(payload: string, signature: string): boolean {
  const expected = signAuditEntry(payload);
  if (!expected) return false;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
