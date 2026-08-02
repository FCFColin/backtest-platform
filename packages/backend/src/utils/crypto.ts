import crypto from 'crypto';
import argon2 from 'argon2';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

export async function hashApiKeyArgon2id(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

export async function verifyApiKeyArgon2id(encoded: string, plaintext: string): Promise<boolean> {
  if (!encoded) return false;
  try {
    return await argon2.verify(encoded, plaintext);
  } catch {
    return false;
  }
}

interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  kid: string;
}

const AES_GCM_ALGORITHM = 'aes-256-gcm';
const GCM_IV_LENGTH = 12;
const DEFAULT_DEV_KEK = 'dev-webhook-kek-default-do-not-use-in-prod';
const DEFAULT_KID = 'default';

function resolveKek(kek?: string): { key: Buffer; kid: string } {
  const kekStr =
    kek ?? process.env.WEBHOOK_SECRET_KEK ?? process.env.ENCRYPTION_KEK ?? DEFAULT_DEV_KEK;
  const key = crypto.createHash('sha256').update(kekStr, 'utf8').digest();
  const kid = process.env.WEBHOOK_SECRET_KID ?? DEFAULT_KID;
  return { key, kid };
}

export async function encrypt(plaintext: string, kek?: string): Promise<EncryptedPayload> {
  const { key, kid } = resolveKek(kek);
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_GCM_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag, kid };
}

export async function decrypt(payload: EncryptedPayload, kek?: string): Promise<string> {
  const { key } = resolveKek(kek);
  if (
    !Buffer.isBuffer(payload.ciphertext) ||
    !Buffer.isBuffer(payload.iv) ||
    !Buffer.isBuffer(payload.tag)
  ) {
    throw new Error('decrypt 入参 ciphertext/iv/tag 必须为 Buffer');
  }
  const decipher = crypto.createDecipheriv(AES_GCM_ALGORITHM, key, payload.iv);
  decipher.setAuthTag(payload.tag);
  const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
