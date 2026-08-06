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

  it.each([
    ['hello', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ])('sha256Hex(%p) 应与独立计算一致', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
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
  it.each([
    ['correct-plaintext', true],
    ['wrong-plaintext', false],
  ])('密钥 %p 校验应返回 %p', async (plaintext, expected) => {
    const hash = await hashApiKeyArgon2id('correct-plaintext');
    expect(await verifyApiKeyArgon2id(hash, plaintext)).toBe(expected);
  });

  it.each(['', 'not-a-valid-argon2-hash', '$argon2id$malformed$hash'])(
    'verifyApiKeyArgon2id(%p) 应返回 false 且不抛错',
    async (encoded) => {
      expect(await verifyApiKeyArgon2id(encoded, 'anything')).toBe(false);
    },
  );

  it('应与 hashApiKeyArgon2id 形成完整往返（roundtrip）', async () => {
    const plaintext = 'roundtrip-api-key-12345';
    const hash = await hashApiKeyArgon2id(plaintext);
    expect(await verifyApiKeyArgon2id(hash, plaintext)).toBe(true);
    expect(await verifyApiKeyArgon2id(hash, plaintext + 'tampered')).toBe(false);
  });
});
