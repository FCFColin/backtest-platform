/**
 * P1-06 单元测试：Envelope Encryption 工具类
 *
 * 企业理由：加密工具类是数据安全的最后一道防线，必须保证：
 * 1. 加密→解密往返一致性
 * 2. 篡改密文会抛出错误（认证加密）
 * 3. 不同 KEK 无法解密
 */

import { describe, it, expect } from 'vitest';
import { EnvelopeEncryption } from '../../../packages/backend/src/utils/envelopeEncryption.js';

const TEST_KEK = EnvelopeEncryption.generateKek();

describe('P1-06: EnvelopeEncryption', () => {
  it('加密→解密往返应返回原始明文', () => {
    const enc = new EnvelopeEncryption(TEST_KEK);
    const plaintext = 'sensitive-api-key-bpk_live_abc123';
    const encrypted = enc.encrypt(plaintext);
    const decrypted = enc.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('每次加密应生成不同的 DEK 和 IV（非确定性）', () => {
    const enc = new EnvelopeEncryption(TEST_KEK);
    const plaintext = 'same-plaintext';
    const enc1 = enc.encrypt(plaintext);
    const enc2 = enc.encrypt(plaintext);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedDek).not.toBe(enc2.encryptedDek);
  });

  it('篡改密文应导致解密失败', () => {
    const enc = new EnvelopeEncryption(TEST_KEK);
    const encrypted = enc.encrypt('original data');
    // 篡改 ciphertext
    const tampered = { ...encrypted, ciphertext: Buffer.from('tampered').toString('base64') };
    expect(() => enc.decrypt(tampered)).toThrow();
  });

  it('使用不同 KEK 应无法解密', () => {
    const enc1 = new EnvelopeEncryption(TEST_KEK);
    const enc2 = new EnvelopeEncryption(EnvelopeEncryption.generateKek());
    const encrypted = enc1.encrypt('secret data');
    expect(() => enc2.decrypt(encrypted)).toThrow();
  });

  it('KEK 长度不是 32 字节应抛出错误', () => {
    const shortKek = Buffer.from('too-short').toString('base64');
    expect(() => new EnvelopeEncryption(shortKek)).toThrow('32 bytes');
  });

  it('generateKek 应返回 Base64 编码的 32 字节 KEK', () => {
    const kek = EnvelopeEncryption.generateKek();
    const decoded = Buffer.from(kek, 'base64');
    expect(decoded.length).toBe(32);
  });

  it('应支持中文明文加密解密', () => {
    const enc = new EnvelopeEncryption(TEST_KEK);
    const plaintext = '敏感数据-中文测试';
    const encrypted = enc.encrypt(plaintext);
    const decrypted = enc.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
