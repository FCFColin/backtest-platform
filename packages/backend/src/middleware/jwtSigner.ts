import fs from 'fs';
import { SignJWT, generateKeyPair, importPKCS8, importSPKI, importJWK } from 'jose';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { errorMessage } from '../utils/errors.js';
import { ROLE_TTL, type JwtPayload, type Role, type TenantContext } from './authShared.js';

type JoseKey = Exclude<Awaited<ReturnType<typeof importPKCS8>>, Uint8Array> | Uint8Array;
const JWT_SECRET = config.JWT_SECRET;
const JWT_ALGORITHM = config.JWT_ALGORITHM;
let devKeyPair: { privateKey: JoseKey; publicKey: JoseKey } | null = null;

async function generateDevKeyPair(): Promise<{ privateKey: JoseKey; publicKey: JoseKey }> {
  if (devKeyPair) return devKeyPair;
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  devKeyPair = { publicKey, privateKey };
  logger.info('[jwtAuth] 已自动生成开发环境 RSA 密钥对（进程重启后失效）');
  return devKeyPair;
}
function readPemFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`无法读取 PEM 文件: ${filePath} - ${errorMessage(err)}`);
  }
}
async function loadKey(type: 'private' | 'public'): Promise<JoseKey> {
  const cfg =
    type === 'private'
      ? { direct: config.JWT_PRIVATE_KEY, file: config.JWT_PRIVATE_KEY_FILE, imp: importPKCS8 }
      : { direct: config.JWT_PUBLIC_KEY, file: config.JWT_PUBLIC_KEY_FILE, imp: importSPKI };
  if (cfg.direct) return cfg.imp(cfg.direct, 'RS256');
  if (cfg.file) return cfg.imp(readPemFile(cfg.file), 'RS256');
  if (config.NODE_ENV !== 'production') {
    const pair = await generateDevKeyPair();
    return type === 'private' ? pair.privateKey : pair.publicKey;
  }
  throw new Error(
    `RS256 模式下必须配置 JWT_${type.toUpperCase()}_KEY 或 JWT_${type.toUpperCase()}_KEY_FILE`,
  );
}
const getHS256Key = () =>
  importJWK({ kty: 'oct', k: Buffer.from(JWT_SECRET, 'utf-8').toString('base64url') }, 'HS256');
const cacheOnce = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let cached: T | null = null;
  return async () => (cached ??= await load());
};
export const getOrCachePrivateKey = cacheOnce(() => loadKey('private'));
export const getOrCachePublicKey = cacheOnce(() => loadKey('public'));
export const getOrCacheHS256Key = cacheOnce(getHS256Key);

export async function generateToken(
  userId: string,
  role: Role,
  tenant?: TenantContext,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + (ROLE_TTL[role] ?? config.JWT_ACCESS_TTL),
    ...(tenant?.tenantId && { tenant_id: tenant.tenantId }),
    ...(tenant?.orgRole && { org_role: tenant.orgRole }),
    ...(tenant?.platformAdmin && { platform_admin: true }),
  };
  const isRs256 = JWT_ALGORITHM === 'RS256';
  const key = isRs256 ? await getOrCachePrivateKey() : await getOrCacheHS256Key();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: isRs256 ? 'RS256' : 'HS256' })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(key);
}
