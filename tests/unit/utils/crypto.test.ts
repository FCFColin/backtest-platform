/**
 * 通用加密原语单元测试（crypto.ts）
 *
 * 企业理由：API Key 哈希存储、邮箱验证令牌、邀请令牌均依赖本模块的 SHA-256 与
 * argon2id 实现。测试覆盖：
 * - sha256Hex：已知向量、空串、Unicode、确定性、输出形态
 * - hashApiKeyArgon2id：返回 argon2id 编码哈希、不同输入产生不同哈希、随机盐
 * - verifyApiKeyArgon2id：空 encoded 直接返回 false、正确密钥匹配、错误密钥拒绝、
 *   损坏哈希触发 catch 分支返回 false（避免侧信道）
 *
 * 实现说明：使用真实 node:crypto 与 argon2（不 mock），与 integrity.test.ts 同策略，
 * 保证原语行为与生产一致。argon2id 默认参数对少量调用足够快。
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  sha256Hex,
  hashApiKeyArgon2id,
  verifyApiKeyArgon2id,
} from '../../../packages/backend/src/utils/crypto.js';

describe('sha256Hex', () => {
  it('应返回 64 字符小写十六进制摘要', () => {
    const digest = sha256Hex('hello');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('应与独立计算的 SHA-256 一致（已知向量）', () => {
    // SHA-256("hello") 标准向量
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    // SHA-256("abc") 标准向量
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('空字符串应返回 SHA-256 空输入摘要', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('相同输入应产生相同摘要（确定性）', () => {
    expect(sha256Hex('deterministic-input')).toBe(sha256Hex('deterministic-input'));
  });

  it('不同输入应产生不同摘要', () => {
    expect(sha256Hex('input-a')).not.toBe(sha256Hex('input-b'));
  });

  it('Unicode 内容应正确哈希（UTF-8 编码）', () => {
    const expected = crypto.createHash('sha256').update('中文', 'utf-8').digest('hex');
    expect(sha256Hex('中文')).toBe(expected);
    expect(sha256Hex('🚀')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashApiKeyArgon2id', () => {
  it('应返回 argon2id 编码哈希字符串', async () => {
    const hash = await hashApiKeyArgon2id('my-secret-api-key');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('不同明文应产生不同哈希（含独立盐）', async () => {
    const h1 = await hashApiKeyArgon2id('key-one');
    const h2 = await hashApiKeyArgon2id('key-two');
    expect(h1).not.toBe(h2);
  });

  it('相同明文两次哈希应不同（随机盐）', async () => {
    const h1 = await hashApiKeyArgon2id('same-key');
    const h2 = await hashApiKeyArgon2id('same-key');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyApiKeyArgon2id', () => {
  it('正确密钥应校验通过', async () => {
    const hash = await hashApiKeyArgon2id('correct-plaintext');
    expect(await verifyApiKeyArgon2id(hash, 'correct-plaintext')).toBe(true);
  });

  it('错误密钥应校验失败', async () => {
    const hash = await hashApiKeyArgon2id('correct-plaintext');
    expect(await verifyApiKeyArgon2id(hash, 'wrong-plaintext')).toBe(false);
  });

  it('空 encoded 应直接返回 false（不调用 argon2.verify）', async () => {
    expect(await verifyApiKeyArgon2id('', 'anything')).toBe(false);
  });

  it('损坏的 encoded 应触发 catch 分支返回 false（不抛错）', async () => {
    // 非法 argon2 编码字符串，argon2.verify 会抛错，被 catch 吞掉返回 false
    expect(await verifyApiKeyArgon2id('not-a-valid-argon2-hash', 'anything')).toBe(false);
  });

  it('格式错误的 argon2id 前缀应返回 false', async () => {
    expect(await verifyApiKeyArgon2id('$argon2id$malformed$hash', 'anything')).toBe(false);
  });

  it('应与 hashApiKeyArgon2id 形成完整往返（roundtrip）', async () => {
    const plaintext = 'roundtrip-api-key-12345';
    const hash = await hashApiKeyArgon2id(plaintext);
    expect(await verifyApiKeyArgon2id(hash, plaintext)).toBe(true);
    expect(await verifyApiKeyArgon2id(hash, plaintext + 'tampered')).toBe(false);
  });
});
