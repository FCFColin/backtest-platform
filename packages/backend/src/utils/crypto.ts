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
