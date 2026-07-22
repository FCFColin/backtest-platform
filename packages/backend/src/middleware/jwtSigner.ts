/**
 * JWT 签名/生成模块
 *
 * 职责：密钥管理、JWT 签名、Access Token 生成。
 * 从 jwtAuth.ts 拆分而来，保持原有逻辑不变。
 *
 * 企业理由：API Key 是静态凭证，泄露后无法撤销且无法区分用户身份。
 * JWT 提供了有状态的会话管理（过期、刷新、角色嵌入），
 * 是企业级 SaaS 的认证标准。同时保留 x-api-key 兼容模式，
 * 确保现有自动化脚本和内部工具无需立即迁移。
 *
 * 使用 jose 库替代自实现 HMAC-SHA256 的企业理由：
 * 1. alg=none 攻击防护——jose 库强制校验算法声明，拒绝 alg:none 令牌，
 *    自实现需手动检查 header.alg，容易遗漏；
 * 2. OIDC/SSO 支持——jose 支持 JWK Set、x5c 证书链等 OIDC 标准验证方式，
 *    为集成企业 IdP（Okta、Azure AD 等）奠定基础；
 * 3. RS256 非对称密钥——私钥签名、公钥验证，支持密钥轮换和安全分发，
 *    HS256 对称密钥需在所有验证方共享同一密钥，泄露面大。
 *
 * 权衡：
 * - jose 库增加了依赖，但它是 JWT/JWS/JWE 的行业标准实现（JWK、JWKS、
 *   多算法支持），比 jsonwebtoken 更符合 JOSE 规范且零原生依赖。
 * - 保留 HS256 向后兼容路径，迁移期间旧令牌仍可验证。
 * - 开发环境跳过认证，方便本地调试，但需确保生产环境不会误配。
 */

import fs from 'fs';
import { SignJWT, generateKeyPair, importPKCS8, importSPKI, importJWK } from 'jose';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { errorMessage } from '../utils/errors.js';
import { type JwtPayload, type TenantContext, ACCESS_TOKEN_EXPIRES_IN_SEC } from './authTypes.js';

// jose 密钥类型：非对称密钥为 CryptoKey（Web Crypto API），对称密钥为 Uint8Array
type JoseKey = Exclude<Awaited<ReturnType<typeof importPKCS8>>, Uint8Array> | Uint8Array;

// ---------------------------------------------------------------------------
// 配置常量
// ---------------------------------------------------------------------------

/**
 * JWT 签名密钥（T-P1-8: 从集中配置读取）。
 *
 * 企业理由：密钥必须通过环境变量注入，禁止硬编码。
 * 开发环境使用固定默认值方便本地联调。
 * 权衡：默认密钥仅用于开发，生产环境必须覆盖（validateConfig 校验）。
 */
const JWT_SECRET = config.JWT_SECRET;

/** JWT 签名算法（从集中配置读取，RS256 或 HS256） */
const JWT_ALGORITHM = config.JWT_ALGORITHM;

// ---------------------------------------------------------------------------
// 密钥管理
// ---------------------------------------------------------------------------

/**
 * 开发环境 RSA 密钥对缓存
 *
 * 企业理由：开发环境不强制配置 RSA 密钥，首次使用时自动生成临时密钥对，
 * 避免开发者因密钥配置问题阻塞开发。生产环境必须通过环境变量注入。
 */
let devKeyPair: { privateKey: JoseKey; publicKey: JoseKey } | null = null;

/**
 * 生成开发环境临时 RSA 密钥对
 *
 * 企业理由：开发便利性——无需预先生成密钥文件即可启动服务。
 * 生成的密钥对仅在进程生命周期内有效，重启后旧令牌失效，
 * 这对开发环境是可接受的。
 *
 * @returns RSA 密钥对（私钥 + 公钥）
 */
async function generateDevKeyPair(): Promise<{ privateKey: JoseKey; publicKey: JoseKey }> {
  if (devKeyPair) return devKeyPair;

  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
  });

  devKeyPair = { privateKey, publicKey };

  logger.info('[jwtAuth] 已自动生成开发环境 RSA 密钥对（进程重启后失效）');
  return devKeyPair;
}

/**
 * 读取 PEM 文件内容
 *
 * @param filePath - PEM 文件路径
 * @returns PEM 文件内容字符串
 */
function readPemFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`无法读取 PEM 文件: ${filePath} - ${errorMessage(err)}`);
  }
}

/**
 * 获取 RSA 私钥（jose JoseKey 对象）
 *
 * 优先级：JWT_PRIVATE_KEY 环境变量 > JWT_PRIVATE_KEY_FILE 文件 > 开发环境自动生成
 */
async function getPrivateKey(): Promise<JoseKey> {
  // 1. 直接从环境变量读取
  if (config.JWT_PRIVATE_KEY) {
    return importPKCS8(config.JWT_PRIVATE_KEY, 'RS256');
  }

  // 2. 从文件读取
  if (config.JWT_PRIVATE_KEY_FILE) {
    const pem = readPemFile(config.JWT_PRIVATE_KEY_FILE);
    return importPKCS8(pem, 'RS256');
  }

  // 3. 开发环境自动生成
  if (config.NODE_ENV !== 'production') {
    const keys = await generateDevKeyPair();
    return keys.privateKey;
  }

  throw new Error('RS256 模式下必须配置 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE');
}

/**
 * 获取 RSA 公钥（jose JoseKey 对象）
 *
 * 优先级：JWT_PUBLIC_KEY 环境变量 > JWT_PUBLIC_KEY_FILE 文件 > 开发环境自动生成
 */
async function getPublicKey(): Promise<JoseKey> {
  // 1. 直接从环境变量读取
  if (config.JWT_PUBLIC_KEY) {
    return importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
  }

  // 2. 从文件读取
  if (config.JWT_PUBLIC_KEY_FILE) {
    const pem = readPemFile(config.JWT_PUBLIC_KEY_FILE);
    return importSPKI(pem, 'RS256');
  }

  // 3. 开发环境自动生成
  if (config.NODE_ENV !== 'production') {
    const keys = await generateDevKeyPair();
    return keys.publicKey;
  }

  throw new Error('RS256 模式下必须配置 JWT_PUBLIC_KEY 或 JWT_PUBLIC_KEY_FILE');
}

/**
 * 获取 HS256 对称密钥（jose JoseKey 对象）
 *
 * 企业理由：HS256 向后兼容路径，用于验证迁移前签发的旧令牌。
 */
async function getHS256Key(): Promise<JoseKey> {
  return importJWK({ kty: 'oct', k: base64urlEncode(JWT_SECRET) }, 'HS256');
}

// ---------------------------------------------------------------------------
// Base64url 工具函数（HS256 向后兼容路径使用）
// ---------------------------------------------------------------------------

/**
 * Base64url 编码（RFC 4648 §5）
 *
 * 用于 HS256 向后兼容路径中的密钥导入。
 */
function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// 密钥缓存（避免每次签名/验证都重新导入）
// ---------------------------------------------------------------------------

let cachedPrivateKey: JoseKey | null = null;
let cachedPublicKey: JoseKey | null = null;
let cachedHS256Key: JoseKey | null = null;

export async function getOrCachePrivateKey(): Promise<JoseKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  cachedPrivateKey = await getPrivateKey();
  return cachedPrivateKey;
}

export async function getOrCachePublicKey(): Promise<JoseKey> {
  if (cachedPublicKey) return cachedPublicKey;
  cachedPublicKey = await getPublicKey();
  return cachedPublicKey;
}

export async function getOrCacheHS256Key(): Promise<JoseKey> {
  if (cachedHS256Key) return cachedHS256Key;
  cachedHS256Key = await getHS256Key();
  return cachedHS256Key;
}

// ---------------------------------------------------------------------------
// JWT 签名与验证（jose 实现）
// ---------------------------------------------------------------------------

/**
 * 使用指定算法签名 JWT。
 *
 * @param payload - JWT payload 对象
 * @param algorithm - 签名算法（'RS256' | 'HS256'）
 * @param key - jose 密钥对象
 * @returns 签名后的 JWT 字符串
 */
async function signJwt(
  payload: JwtPayload,
  algorithm: 'RS256' | 'HS256',
  key: JoseKey,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(key);
}

/**
 * 生成 JWT（根据配置选择 RS256 或 HS256）
 *
 * @param payload - JWT payload 对象
 * @returns 签名后的 JWT 字符串
 */
async function signConfiguredJwt(payload: JwtPayload): Promise<string> {
  if (JWT_ALGORITHM === 'RS256') {
    return signJwt(payload, 'RS256', await getOrCachePrivateKey());
  }
  return signJwt(payload, 'HS256', await getOrCacheHS256Key());
}

// ---------------------------------------------------------------------------
// Token 生成
// ---------------------------------------------------------------------------

/**
 * 生成 Access Token
 *
 * 企业理由：可选 tenant 参数携带多租户上下文（活跃组织、租户内角色、平台管理员标记），
 * 嵌入 JWT 后无状态鉴权链可直接解析租户而无需额外 DB 往返（ADR-032）。
 * 未传 tenant 时退化为单租户/无组织令牌，保持向后兼容。
 *
 * @param userId - 用户 ID
 * @param role - 全局（legacy）RBAC 角色
 * @param tenant - 可选的多租户上下文
 * @returns JWT Access Token 字符串
 */
export async function generateToken(
  userId: string,
  role: 'admin' | 'analyst' | 'readonly',
  tenant?: TenantContext,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC,
  };
  if (tenant?.tenantId) payload.tenant_id = tenant.tenantId;
  if (tenant?.orgRole) payload.org_role = tenant.orgRole;
  if (tenant?.platformAdmin) payload.platform_admin = true;
  return signConfiguredJwt(payload);
}
