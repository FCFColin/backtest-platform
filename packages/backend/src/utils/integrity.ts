import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import { config } from '../config/index.js';

// Security: 数据文件完整性校验
// 企业为何需要：缓存文件被篡改可导致错误的回测结果，影响投资决策
// 权衡：每次读取需校验，增加约1ms延迟，但安全性远高于便利性

/**
 * 对数据文件生成 HMAC-SHA256 签名并写入 .sig 文件。
 * 未配置 AUDIT_HMAC_KEY 时静默跳过。
 */
export async function signFile(filePath: string): Promise<void> {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return;

  const content = await fs.readFile(filePath);
  const signature = crypto.createHmac('sha256', key).update(content).digest('hex');
  await fs.writeFile(filePath + '.sig', signature);
}

/**
 * 校验数据文件的 HMAC-SHA256 签名。
 * 未配置 AUDIT_HMAC_KEY 时返回 true（无密钥=不校验）。
 * 签名文件不存在或校验失败时返回 false。
 */
export async function verifyFile(filePath: string): Promise<boolean> {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return true;

  try {
    const [content, signature] = await Promise.all([
      fs.readFile(filePath),
      fs.readFile(filePath + '.sig', 'utf-8'),
    ]);
    const expected = crypto.createHmac('sha256', key).update(content).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * signFile 的同步版本，供同步缓存写入热路径（dataService.readCache/writeCache）使用。
 * 未配置 AUDIT_HMAC_KEY 时静默跳过。
 *
 * Security (T-06)：缓存文件写入后立即签名，使后续读取可检测离线篡改。
 * @internal 测试专用：生产代码零外部引用，仅单元测试直接调用
 */
export function signFileSync(filePath: string): void {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return;
  const content = fsSync.readFileSync(filePath);
  const signature = crypto.createHmac('sha256', key).update(content).digest('hex');
  fsSync.writeFileSync(filePath + '.sig', signature);
}

/**
 * verifyFile 的同步版本。未配置 AUDIT_HMAC_KEY 时返回 true（无密钥=不校验）。
 * 内容与 .sig 不匹配、签名缺失或读取异常时返回 false。
 *
 * Security (T-06)：在读取缓存内容并据其产生回测结果前校验完整性，防止被篡改的缓存
 * 污染投资决策（OWASP A08 软件与数据完整性失败）。
 * @internal 测试专用：生产代码零外部引用，仅单元测试直接调用
 */
export function verifyFileSync(filePath: string): boolean {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return true;
  try {
    const content = fsSync.readFileSync(filePath);
    const signature = fsSync.readFileSync(filePath + '.sig', 'utf-8');
    const expected = crypto.createHmac('sha256', key).update(content).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
