import crypto from 'crypto';
import fs from 'fs/promises';

// Security: 数据文件完整性校验
// 企业为何需要：缓存文件被篡改可导致错误的回测结果，影响投资决策
// 权衡：每次读取需校验，增加约1ms延迟，但安全性远高于便利性

/**
 * 对数据文件生成 HMAC-SHA256 签名并写入 .sig 文件。
 * 未配置 AUDIT_HMAC_KEY 时静默跳过。
 */
export async function signFile(filePath: string): Promise<void> {
  const key = process.env.AUDIT_HMAC_KEY;
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
  const key = process.env.AUDIT_HMAC_KEY;
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
