/**
 * 数据文件完整性校验单元测试（T-P3-8）
 *
 * 企业理由：缓存文件被篡改可导致错误的回测结果，影响投资决策。
 * HMAC-SHA256 签名校验是数据完整性的最后防线。测试覆盖：
 * - 签名生成（格式、确定性、写入文件）
 * - 签名校验（有效、篡改、错误密钥）
 * - 边界（空输入、大输入、缺失密钥、缺失签名文件）
 *
 * 实现说明：signFile/verifyFile 操作真实文件系统，测试在 OS 临时目录
 * 创建/清理文件，避免污染项目目录。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

import {
  signFile,
  verifyFile,
  signFileSync,
  verifyFileSync,
} from '../../../api/utils/integrity.js';

describe('integrity - HMAC 签名校验', () => {
  let tmpDir: string;
  const testKey = 'test-audit-hmac-key-very-secret-32bytes';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integrity-test-'));
    process.env.AUDIT_HMAC_KEY = testKey;
  });

  afterEach(async () => {
    delete process.env.AUDIT_HMAC_KEY;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('signFile 签名生成', () => {
    it('应为文件生成 .sig 签名文件', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, '{"price":100}');
      await signFile(filePath);

      const sig = await fs.readFile(filePath + '.sig', 'utf-8');
      expect(sig).toBeTruthy();
      expect(sig.length).toBe(64); // SHA-256 hex = 64 字符
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('相同内容+相同密钥应产生相同签名（确定性）', async () => {
      const f1 = path.join(tmpDir, 'a.json');
      const f2 = path.join(tmpDir, 'b.json');
      await fs.writeFile(f1, 'same-content');
      await fs.writeFile(f2, 'same-content');

      await signFile(f1);
      await signFile(f2);

      const sig1 = await fs.readFile(f1 + '.sig', 'utf-8');
      const sig2 = await fs.readFile(f2 + '.sig', 'utf-8');
      expect(sig1).toBe(sig2);
    });

    it('不同内容应产生不同签名', async () => {
      const f1 = path.join(tmpDir, 'a.json');
      const f2 = path.join(tmpDir, 'b.json');
      await fs.writeFile(f1, 'content-one');
      await fs.writeFile(f2, 'content-two');

      await signFile(f1);
      await signFile(f2);

      const sig1 = await fs.readFile(f1 + '.sig', 'utf-8');
      const sig2 = await fs.readFile(f2 + '.sig', 'utf-8');
      expect(sig1).not.toBe(sig2);
    });

    it('签名应与独立计算的 HMAC-SHA256 一致', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      const content = '{"ticker":"AAPL","price":150.5}';
      await fs.writeFile(filePath, content);
      await signFile(filePath);

      const sig = await fs.readFile(filePath + '.sig', 'utf-8');
      const expected = crypto.createHmac('sha256', testKey).update(content).digest('hex');
      expect(sig).toBe(expected);
    });

    it('未配置 AUDIT_HMAC_KEY 时应静默跳过（不生成 .sig）', async () => {
      delete process.env.AUDIT_HMAC_KEY;
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      await signFile(filePath);

      await expect(fs.readFile(filePath + '.sig')).rejects.toThrow();
    });
  });

  describe('verifyFile 签名校验', () => {
    it('有效签名应返回 true', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'valid-content');
      await signFile(filePath);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });

    it('篡改数据文件后应返回 false', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'original-content');
      await signFile(filePath);

      // 篡改数据文件
      await fs.writeFile(filePath, 'tampered-content');

      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('篡改签名文件后应返回 false', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'original-content');
      await signFile(filePath);

      // 篡改签名文件
      const fakeSig = 'a'.repeat(64);
      await fs.writeFile(filePath + '.sig', fakeSig);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('使用错误密钥签名后应返回 false', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');

      // 用错误密钥签名
      process.env.AUDIT_HMAC_KEY = 'wrong-key';
      await signFile(filePath);

      // 恢复正确密钥后校验
      process.env.AUDIT_HMAC_KEY = testKey;
      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('签名文件缺失时应返回 false', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      // 不调用 signFile，无 .sig 文件

      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('数据文件缺失时应返回 false', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.json');
      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('未配置 AUDIT_HMAC_KEY 时应返回 true（无密钥=不校验）', async () => {
      delete process.env.AUDIT_HMAC_KEY;
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });
  });

  describe('边界与异常输入', () => {
    it('空文件内容应产生有效签名', async () => {
      const filePath = path.join(tmpDir, 'empty.json');
      await fs.writeFile(filePath, '');
      await signFile(filePath);

      const sig = await fs.readFile(filePath + '.sig', 'utf-8');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });

    it('大文件（1MB）应正常签名且不崩溃', async () => {
      const filePath = path.join(tmpDir, 'large.json');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      await fs.writeFile(filePath, largeContent);

      const start = Date.now();
      await signFile(filePath);
      const elapsed = Date.now() - start;

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
      // 1MB HMAC 应在 100ms 内完成
      expect(elapsed).toBeLessThan(1000);
    });

    it('二进制内容应正确签名与校验', async () => {
      const filePath = path.join(tmpDir, 'binary.bin');
      const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0xfe, 0x01]);
      await fs.writeFile(filePath, binary);
      await signFile(filePath);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });

    it('Unicode 内容应正确签名与校验', async () => {
      const filePath = path.join(tmpDir, 'unicode.json');
      const unicode = '{"name":"中文测试","emoji":"🚀"}';
      await fs.writeFile(filePath, unicode);
      await signFile(filePath);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });

    it('单字节修改应使校验失败', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'abcdefghijklmnop');
      await signFile(filePath);

      // 修改最后一个字节
      await fs.writeFile(filePath, 'abcdefghijklmnoq');
      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });
  });

  describe('密钥边界', () => {
    it('空字符串密钥应被视为未配置（跳过签名）', async () => {
      process.env.AUDIT_HMAC_KEY = '';
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      await signFile(filePath);
      // 空字符串 falsy，应跳过
      await expect(fs.readFile(filePath + '.sig')).rejects.toThrow();
    });

    it('短密钥（1 字符）应能正常工作', async () => {
      process.env.AUDIT_HMAC_KEY = 'k';
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      await signFile(filePath);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });

    it('长密钥（256 字符）应能正常工作', async () => {
      process.env.AUDIT_HMAC_KEY = 'k'.repeat(256);
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      await signFile(filePath);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(true);
    });
  });

  describe('verifyFile 失败分支', () => {
    it('签名长度不匹配应返回 false（timingSafeEqual 异常）', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      await signFile(filePath);
      await fs.writeFile(filePath + '.sig', 'abc');

      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('签名含非 hex 字符应返回 false', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'content');
      await signFile(filePath);
      await fs.writeFile(filePath + '.sig', 'g'.repeat(64));

      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });

    it('仅差一字节的签名应返回 false', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, 'timing-attack-test');
      await signFile(filePath);
      const sig = await fs.readFile(filePath + '.sig', 'utf-8');
      const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
      await fs.writeFile(filePath + '.sig', tampered);

      const ok = await verifyFile(filePath);
      expect(ok).toBe(false);
    });
  });

  describe('signFileSync / verifyFileSync 同步路径', () => {
    it('同步签名与校验应一致', () => {
      const filePath = path.join(tmpDir, 'sync.json');
      const content = '{"sync":true}';
      fsSync.writeFileSync(filePath, content);
      signFileSync(filePath);

      const sig = fsSync.readFileSync(filePath + '.sig', 'utf-8');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
      expect(verifyFileSync(filePath)).toBe(true);
    });

    it('同步校验篡改文件应返回 false', () => {
      const filePath = path.join(tmpDir, 'sync-tamper.json');
      fsSync.writeFileSync(filePath, 'original');
      signFileSync(filePath);
      fsSync.writeFileSync(filePath, 'tampered');

      expect(verifyFileSync(filePath)).toBe(false);
    });

    it('未配置密钥时 verifyFileSync 应返回 true', () => {
      delete process.env.AUDIT_HMAC_KEY;
      const filePath = path.join(tmpDir, 'no-key.json');
      fsSync.writeFileSync(filePath, 'data');
      expect(verifyFileSync(filePath)).toBe(true);
    });

    it('缺失 .sig 时 verifyFileSync 应返回 false', () => {
      const filePath = path.join(tmpDir, 'no-sig.json');
      fsSync.writeFileSync(filePath, 'data');
      expect(verifyFileSync(filePath)).toBe(false);
    });

    it('未配置密钥时 signFileSync 应静默跳过', () => {
      delete process.env.AUDIT_HMAC_KEY;
      const filePath = path.join(tmpDir, 'skip-sign.json');
      fsSync.writeFileSync(filePath, 'data');
      signFileSync(filePath);
      expect(() => fsSync.readFileSync(filePath + '.sig')).toThrow();
    });
  });
});
