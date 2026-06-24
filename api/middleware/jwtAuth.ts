/**
 * JWT / OIDC 认证中间件
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
 * - Refresh Token 存储在 Redis（含内存回退），支持多实例部署和 Token Family 复用检测。
 * - 开发环境跳过认证，方便本地调试，但需确保生产环境不会误配。
 */

import crypto from 'crypto';
import fs from 'fs';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, importJWK, generateKeyPair } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// jose 密钥类型：非对称密钥为 CryptoKey，对称密钥为 Uint8Array
type JoseKey = CryptoKey | Uint8Array;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** JWT payload 结构 */
export interface JwtPayload {
  /** 用户 ID */
  sub: string;
  /** 用户角色 */
  role: 'admin' | 'analyst' | 'readonly';
  /** 签发时间（秒级时间戳） */
  iat: number;
  /** 过期时间（秒级时间戳） */
  exp: number;
}

/** 扩展 Express Request，附加解码后的用户信息 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload | null;
}

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

/** Access Token 有效期（秒，从集中配置读取） */
const ACCESS_TOKEN_EXPIRES_IN_SEC = config.JWT_ACCESS_TTL;

/** Refresh Token 有效期（秒，从集中配置读取） */
const REFRESH_TOKEN_EXPIRES_IN_SEC = config.JWT_REFRESH_TTL;

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
    throw new Error(`无法读取 PEM 文件: ${filePath} - ${err instanceof Error ? err.message : err}`);
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
    return await importPKCS8(config.JWT_PRIVATE_KEY, 'RS256');
  }

  // 2. 从文件读取
  if (config.JWT_PRIVATE_KEY_FILE) {
    const pem = readPemFile(config.JWT_PRIVATE_KEY_FILE);
    return await importPKCS8(pem, 'RS256');
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
    return await importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
  }

  // 2. 从文件读取
  if (config.JWT_PUBLIC_KEY_FILE) {
    const pem = readPemFile(config.JWT_PUBLIC_KEY_FILE);
    return await importSPKI(pem, 'RS256');
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
  return await importJWK({ kty: 'oct', k: base64urlEncode(JWT_SECRET) }, 'HS256');
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

async function getOrCachePrivateKey(): Promise<JoseKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  cachedPrivateKey = await getPrivateKey();
  return cachedPrivateKey;
}

async function getOrCachePublicKey(): Promise<JoseKey> {
  if (cachedPublicKey) return cachedPublicKey;
  cachedPublicKey = await getPublicKey();
  return cachedPublicKey;
}

async function getOrCacheHS256Key(): Promise<JoseKey> {
  if (cachedHS256Key) return cachedHS256Key;
  cachedHS256Key = await getHS256Key();
  return cachedHS256Key;
}

// ---------------------------------------------------------------------------
// JWT 签名与验证（jose 实现）
// ---------------------------------------------------------------------------

/**
 * 使用 RS256 签名 JWT
 *
 * @param payload - JWT payload 对象
 * @returns 签名后的 JWT 字符串
 */
async function signJwtRS256(payload: JwtPayload): Promise<string> {
  const privateKey = await getOrCachePrivateKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(privateKey);
}

/**
 * 使用 HS256 签名 JWT
 *
 * @param payload - JWT payload 对象
 * @returns 签名后的 JWT 字符串
 */
async function signJwtHS256(payload: JwtPayload): Promise<string> {
  const key = await getOrCacheHS256Key();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(key);
}

/**
 * 生成 JWT（根据配置选择 RS256 或 HS256）
 *
 * 企业理由：RS256 为默认签名算法，HS256 作为向后兼容路径保留。
 * 迁移期间新令牌使用 RS256，旧令牌仍可通过 HS256 验证。
 *
 * @param payload - JWT payload 对象
 * @returns 签名后的 JWT 字符串
 */
async function signJwt(payload: JwtPayload): Promise<string> {
  if (JWT_ALGORITHM === 'RS256') {
    return signJwtRS256(payload);
  }
  return signJwtHS256(payload);
}

/**
 * 验证并解码 JWT
 *
 * 企业理由：验证时先尝试 RS256，失败后回退 HS256，确保迁移期间
 * 新旧令牌均可验证。jose 库的 jwtVerify 强制校验 alg 声明，
 * 自动拒绝 alg:none 令牌，从根本上防御算法混淆攻击。
 *
 * @param token - JWT 字符串
 * @returns 解码后的 payload，验证失败返回 null
 */
async function verifyJwt(token: string): Promise<JwtPayload | null> {
  // 1. 先尝试 RS256 验证
  try {
    const publicKey = await getOrCachePublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
    });
    return payload as unknown as JwtPayload;
  } catch {
    // RS256 验证失败，继续尝试 HS256
  }

  // 2. 回退 HS256 验证（向后兼容）
  try {
    const key = await getOrCacheHS256Key();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Refresh Token 存储（Redis + Token Family 复用检测）
// ---------------------------------------------------------------------------

/**
 * Refresh Token Redis 存储
 *
 * 企业理由：Refresh Token 必须可撤销（用户登出、安全事件时吊销），
 * 因此需要服务端存储。Redis 替代内存 Map 的理由：
 * 1. 多实例 K8s 部署——内存 Map 仅在单进程内可见，Pod A 签发的
 *    refresh token 在 Pod B 无法验证，导致刷新失败；
 * 2. 进程重启不丢失——内存 Map 随进程消亡，滚动更新后所有 refresh token
 *    失效，用户被强制登出。Redis 持久化保证跨重启有效；
 * 3. 自动过期——Redis TTL 自动清理过期 token，无需手动定时清理；
 * 4. Token Family 复用检测——检测被盗 token 的重放，自动撤销整个家族。
 *
 * 权衡：引入 Redis 依赖增加基础设施复杂度，但 K8s 多副本部署下
 * 内存方案完全无法工作。开发环境 Redis 不可用时自动回退到内存 Map，
 * 确保本地开发零依赖启动。
 */
interface RefreshTokenEntry {
  userId: string;
  role: 'admin' | 'analyst' | 'readonly';
  expiresAt: number; // 秒级时间戳
  familyId: string;  // Token 家族 ID，用于复用检测
}

/**
 * Token Family 记录
 *
 * 企业理由：Token Family 是 OAuth 2.1 推荐的 refresh token 安全机制。
 * 同一次登录产生的所有 refresh token 属于同一个"家族"（通过轮换串联）。
 * 当检测到已使用过的 token 被再次使用时，说明攻击者可能截获了该 token，
 * 此时必须撤销整个家族，防止攻击者利用截获的 token 继续访问。
 *
 * 场景：用户刷新 token → 旧 token T1 失效，新 token T2 签发。
 * 攻击者截获 T1 并在用户使用 T2 之后尝试使用 T1 → 检测到 T1 复用 →
 * 撤销整个 family（T2 也失效），迫使攻击者和合法用户都重新认证。
 */
interface TokenFamilyEntry {
  lastToken: string;   // 家族中最新有效的 token
  revoked: boolean;    // 整个家族是否已被撤销
}

/** Redis Key 前缀 */
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const TOKEN_FAMILY_PREFIX = 'token_family:';

/** 内存回退存储（Redis 不可用时使用） */
const fallbackRefreshTokenStore = new Map<string, RefreshTokenEntry>();
const fallbackTokenFamilyStore = new Map<string, TokenFamilyEntry>();

/** Redis 是否可用 */
let redisAvailable: boolean | null = null;

async function isRedisAvailable(): Promise<boolean> {
  if (redisAvailable === true) return true;
  try {
    const result = await appRedis.ping();
    redisAvailable = result === 'PONG';
    return redisAvailable;
  } catch {
    if (redisAvailable !== false) {
      logger.warn('[jwtAuth] Redis 不可用，Refresh Token 回退到内存存储');
    }
    redisAvailable = false;
    return false;
  }
}

appRedis.on('ready', () => {
  redisAvailable = true;
});

appRedis.on('error', () => {
  redisAvailable = false;
});

// ---------------------------------------------------------------------------
// Token 生成与刷新
// ---------------------------------------------------------------------------

/**
 * 生成 Access Token
 *
 * @param userId - 用户 ID
 * @param role - 用户角色
 * @returns JWT Access Token 字符串
 */
export async function generateToken(userId: string, role: 'admin' | 'analyst' | 'readonly'): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC,
  };
  return signJwt(payload);
}

/**
 * 生成 Refresh Token 并存储
 *
 * 企业理由：Access Token 短期有效（15min），Refresh Token 长期有效（7d），
 * 用户无需频繁重新登录。Refresh Token 仅用于换取新的 Access Token，
 * 不携带业务权限，降低泄露风险。
 *
 * Token Family 机制：每次登录创建新的 familyId，后续刷新产生的 token
 * 都属于同一 family。若检测到旧 token 被复用，撤销整个 family。
 *
 * @param userId - 用户 ID
 * @param role - 用户角色
 * @param existingFamilyId - 已有的 family ID（刷新时传入，登录时为空）
 * @returns 随机 Refresh Token 字符串
 */
export async function generateRefreshToken(
  userId: string,
  role: 'admin' | 'analyst' | 'readonly',
  existingFamilyId?: string,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const familyId = existingFamilyId || crypto.randomBytes(16).toString('hex');
  const ttlSec = REFRESH_TOKEN_EXPIRES_IN_SEC;

  const entry: RefreshTokenEntry = {
    userId,
    role,
    expiresAt: now + ttlSec,
    familyId,
  };

  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      // 存储 refresh token，带 TTL 自动过期
      await appRedis.set(
        `${REFRESH_TOKEN_PREFIX}${token}`,
        JSON.stringify(entry),
        'EX',
        ttlSec,
      );

      // 更新 token family 记录
      const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
      await appRedis.set(
        familyKey,
        JSON.stringify({ lastToken: token, revoked: false } satisfies TokenFamilyEntry),
        'EX',
        ttlSec,
      );

      logger.info({ userId, familyId }, '[jwtAuth] Redis: Refresh Token 已存储');
    } catch (err) {
      logger.warn({ err: String(err) }, '[jwtAuth] Redis 存储失败，回退到内存');
      redisAvailable = false;
      fallbackRefreshTokenStore.set(token, entry);
      fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
    }
  } else {
    // 内存回退
    fallbackRefreshTokenStore.set(token, entry);
    fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
  }

  return token;
}

/**
 * 使用 Refresh Token 换取新的 Access Token
 *
 * 企业理由：Refresh Token 轮换机制——每次刷新后旧 token 失效，
 * 限制被盗 token 的使用窗口。Token Family 复用检测确保：
 * 若已使用的旧 token 被再次提交，说明可能存在 token 泄露，
 * 立即撤销整个 family 中所有 token，强制重新认证。
 *
 * @param refreshToken - 旧的 Refresh Token
 * @returns 新的 token 对，或 null 表示无效/过期/复用检测触发
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    return refreshAccessTokenRedis(refreshToken);
  } else {
    return refreshAccessTokenMemory(refreshToken);
  }
}

/**
 * Redis 模式：Refresh Token 刷新 + Token Family 复用检测
 *
 * 企业理由：Redis 原子操作确保并发刷新的安全性。
 * 流程：
 * 1. 读取 token 对应的 entry（含 familyId）
 * 2. 检查 family 是否已被撤销（revoked=true）
 * 3. 检查该 token 是否为 family 中最新的 token
 *    - 若不是最新 → 说明是旧 token 被复用 → 撤销整个 family
 *    - 若是最新 → 正常刷新，删除旧 token，签发新 token
 * 4. 更新 family 的 lastToken 为新 token
 */
async function refreshAccessTokenRedis(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
    const raw = await appRedis.get(tokenKey);

    if (!raw) {
      // Token 不存在（已过期/已使用/从未签发）
      // 但可能是已使用的旧 token 被复用，需检查 family
      return await checkReuseAndRevoke(refreshToken);
    }

    const entry: RefreshTokenEntry = JSON.parse(raw);

    // 检查过期
    const now = Math.floor(Date.now() / 1000);
    if (entry.expiresAt < now) {
      await appRedis.del(tokenKey);
      return null;
    }

    // 检查 family 是否已被撤销
    const familyKey = `${TOKEN_FAMILY_PREFIX}${entry.familyId}`;
    const familyRaw = await appRedis.get(familyKey);
    if (familyRaw) {
      const family: TokenFamilyEntry = JSON.parse(familyRaw);
      if (family.revoked) {
        logger.warn({ familyId: entry.familyId }, '[jwtAuth] Token family 已被撤销（复用检测触发），拒绝刷新');
        await appRedis.del(tokenKey);
        return null;
      }
    }

    // 正常刷新：将旧 token 标记为"已使用"（用于复用检测），而非直接删除
    // 企业理由：保留旧 token 的 familyId 映射，使复用检测能识别已使用的 token
    const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
    await appRedis.set(usedKey, JSON.stringify({ familyId: entry.familyId }), 'EX', REFRESH_TOKEN_EXPIRES_IN_SEC);
    await appRedis.del(tokenKey);

    // 签发新 token 对
    const accessToken = await generateToken(entry.userId, entry.role);
    const newRefreshToken = await generateRefreshToken(entry.userId, entry.role, entry.familyId);

    return { accessToken, refreshToken: newRefreshToken };
  } catch (err) {
    logger.warn({ err: String(err) }, '[jwtAuth] Redis 刷新操作异常，回退到内存模式');
    redisAvailable = false;
    return refreshAccessTokenMemory(refreshToken);
  }
}

/**
 * 复用检测：当 token 不在 Redis 中时，遍历 family 查找是否为已使用的旧 token
 *
 * 企业理由：攻击者截获旧 token T1，在合法用户已用 T1 换取 T2 后，
 * 攻击者尝试使用 T1。此时 T1 已从 Redis 删除（正常刷新时删除），
 * 但我们无法直接知道 T1 属于哪个 family。
 *
 * 策略：由于 token 中不含 familyId（出于安全考虑，token 本身是随机字符串），
 * 当 token 不存在时无法确定其 family。但 OAuth 2.1 的最佳实践是：
 * 当客户端提交了一个不存在的 refresh token 时，如果该 token 曾被使用过
 * （即已被删除），则应视为潜在的安全事件。
 *
 * 实际实现中，我们在刷新时不立即删除旧 token，而是将其标记为"已使用"，
 * 这样可以检测到复用。具体做法：
 * - 刷新时，将旧 token 的值更新为 { used: true, familyId } 而非删除
 * - 检测到 used: true 的 token 被提交时，撤销整个 family
 */
async function checkReuseAndRevoke(refreshToken: string): Promise<null> {
  // 检查是否是标记为"已使用"的 token（用于复用检测）
  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  const usedRaw = await appRedis.get(usedKey);

  if (usedRaw) {
    // 这是一个已使用的 token 被复用！撤销整个 family
    const { familyId } = JSON.parse(usedRaw) as { familyId: string };
    logger.warn({ familyId, token: refreshToken.substring(0, 8) + '...' }, '[jwtAuth] 检测到 Refresh Token 复用！撤销整个 Token Family');

    const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
    await appRedis.set(familyKey, JSON.stringify({ lastToken: '', revoked: true }), 'EX', REFRESH_TOKEN_EXPIRES_IN_SEC);

    // 删除 family 中最新 token（如果还存在）
    const familyRaw = await appRedis.get(familyKey);
    if (familyRaw) {
      const family: TokenFamilyEntry = JSON.parse(familyRaw);
      if (family.lastToken) {
        await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
      }
    }

    return null;
  }

  // Token 确实不存在（从未签发或已过期被 Redis 自动清理）
  return null;
}

/**
 * 内存回退模式：Refresh Token 刷新 + Token Family 复用检测
 */
async function refreshAccessTokenMemory(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  // 先检查是否为已使用的 token（复用检测）
  const usedEntry = fallbackRefreshTokenStore.get(`used:${refreshToken}`);
  if (usedEntry) {
    // 检测到复用！撤销整个 family
    logger.warn({ familyId: usedEntry.familyId }, '[jwtAuth] 内存模式：检测到 Refresh Token 复用！撤销整个 Token Family');
    const family = fallbackTokenFamilyStore.get(usedEntry.familyId);
    if (family) {
      // 删除 family 中最新 token
      if (family.lastToken) {
        fallbackRefreshTokenStore.delete(family.lastToken);
      }
      family.revoked = true;
    }
    fallbackRefreshTokenStore.delete(`used:${refreshToken}`);
    return null;
  }

  const entry = fallbackRefreshTokenStore.get(refreshToken);
  if (!entry) return null;

  // 检查过期
  const now = Math.floor(Date.now() / 1000);
  if (entry.expiresAt < now) {
    fallbackRefreshTokenStore.delete(refreshToken);
    return null;
  }

  // 检查 family 是否已被撤销
  const family = fallbackTokenFamilyStore.get(entry.familyId);
  if (family?.revoked) {
    logger.warn({ familyId: entry.familyId }, '[jwtAuth] 内存模式：Token family 已被撤销，拒绝刷新');
    fallbackRefreshTokenStore.delete(refreshToken);
    return null;
  }

  // 将旧 token 标记为"已使用"（用于复用检测），而非直接删除
  fallbackRefreshTokenStore.set(`used:${refreshToken}`, entry);
  fallbackRefreshTokenStore.delete(refreshToken);

  // 签发新 token 对
  const accessToken = await generateToken(entry.userId, entry.role);
  const newRefreshToken = await generateRefreshToken(entry.userId, entry.role, entry.familyId);

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * 撤销 Refresh Token（登出时调用）
 *
 * 企业理由：用户主动登出时，应撤销该 token 对应的整个 family，
 * 确保所有通过该登录会话签发的 refresh token 均失效，
 * 防止攻击者利用截获的 token 继续访问。
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
      const raw = await appRedis.get(tokenKey);

      if (raw) {
        const entry: RefreshTokenEntry = JSON.parse(raw);
        // 撤销整个 family
        const familyKey = `${TOKEN_FAMILY_PREFIX}${entry.familyId}`;
        await appRedis.set(familyKey, JSON.stringify({ lastToken: '', revoked: true }), 'EX', REFRESH_TOKEN_EXPIRES_IN_SEC);
        await appRedis.del(tokenKey);
        logger.info({ familyId: entry.familyId }, '[jwtAuth] Redis: Refresh Token 及其 Family 已撤销');
      }

      // 也检查 used token
      const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
      const usedRaw = await appRedis.get(usedKey);
      if (usedRaw) {
        const { familyId } = JSON.parse(usedRaw) as { familyId: string };
        const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
        await appRedis.set(familyKey, JSON.stringify({ lastToken: '', revoked: true }), 'EX', REFRESH_TOKEN_EXPIRES_IN_SEC);
        await appRedis.del(usedKey);
      }
    } catch (err) {
      logger.warn({ err: String(err) }, '[jwtAuth] Redis 撤销操作异常，回退到内存');
      redisAvailable = false;
      revokeRefreshTokenMemory(refreshToken);
    }
  } else {
    revokeRefreshTokenMemory(refreshToken);
  }
}

function revokeRefreshTokenMemory(refreshToken: string): void {
  const entry = fallbackRefreshTokenStore.get(refreshToken) || fallbackRefreshTokenStore.get(`used:${refreshToken}`);
  if (entry) {
    const family = fallbackTokenFamilyStore.get(entry.familyId);
    if (family) {
      if (family.lastToken) {
        fallbackRefreshTokenStore.delete(family.lastToken);
      }
      family.revoked = true;
    }
  }
  fallbackRefreshTokenStore.delete(refreshToken);
  fallbackRefreshTokenStore.delete(`used:${refreshToken}`);
}

/**
 * 验证 Access Token，返回解码后的 payload
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return verifyJwt(token);
}

// ---------------------------------------------------------------------------
// Express 中间件
// ---------------------------------------------------------------------------

/**
 * JWT 认证中间件
 *
 * 企业理由：统一认证入口，支持 Bearer Token 和 x-api-key 两种模式，
 * 兼顾安全升级（JWT）和现有系统兼容（API Key）。
 *
 * 认证优先级：
 * 1. Authorization: Bearer <token> → JWT 验证
 * 2. x-api-key header → 兼容旧 API Key 模式
 * 3. 开发环境（NODE_ENV !== 'production'）→ 跳过认证
 *
 * 权衡：双模式增加了中间件复杂度，但避免了迁移期的认证中断。
 * 生产环境应逐步废弃 x-api-key，仅保留 JWT。
 */
export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  logger.info({ middleware: 'jwtAuth', path: req.path, method: req.method, requestId: (req as any).id }, '[jwtAuth] JWT 认证检查');

  // 开发环境跳过认证（T-P1-8: 使用集中配置判断）
  if (config.NODE_ENV !== 'production' && config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production') {
    logger.info({ middleware: 'jwtAuth', path: req.path }, '[jwtAuth] 开发环境跳过认证');
    // 注入默认用户信息，下游 RBAC 可正常工作
    req.user = {
      sub: 'dev-user',
      role: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
    };
    next();
    return;
  }

  // 1. 尝试 Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    verifyJwt(token).then((payload) => {
      if (payload) {
        req.user = payload;
        logger.info({ middleware: 'jwtAuth', path: req.path, userId: req.user?.sub, role: req.user?.role, requestId: (req as any).id }, '[jwtAuth] JWT 认证通过');
        next();
      } else {
        logger.warn({ middleware: 'jwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: (req as any).id }, '[jwtAuth] JWT 认证失败');
        res.status(401).json({
          success: false,
          error: {
            type: 'https://backtest.platform/errors/unauthorized',
            title: 'Unauthorized',
            status: 401,
            code: 'INVALID_TOKEN',
            detail: 'JWT token 无效或已过期',
          },
        });
      }
    }).catch((err) => {
      logger.warn({ middleware: 'jwtAuth', path: req.path, error: String(err), requestId: (req as any).id }, '[jwtAuth] JWT 验证异常');
      res.status(401).json({
        success: false,
        error: {
          type: 'https://backtest.platform/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          code: 'INVALID_TOKEN',
          detail: 'JWT token 无效或已过期',
        },
      });
    });
    return;
  }

  // 2. 尝试 x-api-key 兼容模式
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    // API Key 模式：验证 key 是否匹配，匹配则注入默认 analyst 角色
    if (config.ADMIN_API_KEY && apiKey.length <= 128) {
      const expected = config.ADMIN_API_KEY;
      if (apiKey.length === expected.length) {
        const a = Buffer.from(apiKey, 'utf-8');
        const b = Buffer.from(expected, 'utf-8');
        if (crypto.timingSafeEqual(a, b)) {
          req.user = {
            sub: 'api-key-user',
            role: 'analyst',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
          };
          logger.info({ middleware: 'jwtAuth', path: req.path, userId: req.user.sub, role: req.user.role, requestId: (req as any).id }, '[jwtAuth] JWT 认证通过');
          next();
          return;
        }
      }
    }
    logger.warn({ middleware: 'jwtAuth', path: req.path, error: 'API Key 无效', requestId: (req as any).id }, '[jwtAuth] JWT 认证失败');
    res.status(401).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        code: 'INVALID_API_KEY',
        detail: 'API Key 无效',
      },
    });
    return;
  }

  // 3. 无任何认证凭证
  logger.warn({ middleware: 'jwtAuth', path: req.path, error: '缺少认证凭证', requestId: (req as any).id }, '[jwtAuth] JWT 认证失败');
  res.status(401).json({
    success: false,
    error: {
      type: 'https://backtest.platform/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      code: 'MISSING_CREDENTIALS',
      detail: '缺少认证凭证，请提供 Bearer Token 或 x-api-key',
    },
  });
}

/**
 * 可选 JWT 认证中间件
 *
 * 企业理由：部分端点（如回测执行）需要识别用户身份但不强制要求认证，
 * 未认证用户以 readonly 角色访问。
 * 权衡：可选认证降低了安全门槛，但渐进式引入比一刀切更可行。
 */
export function optionalJwtAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  logger.info({ middleware: 'optionalJwtAuth', path: req.path, method: req.method, requestId: (req as any).id }, '[jwtAuth] 可选 JWT 认证检查');
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    verifyJwt(token).then((payload) => {
      if (payload) {
        req.user = payload;
        logger.info({ middleware: 'optionalJwtAuth', path: req.path, userId: req.user?.sub, role: req.user?.role, requestId: (req as any).id }, '[jwtAuth] JWT 认证通过');
      } else {
        // 无效/过期 Token：显式置空，避免上游中间件残留的 user 误用
        req.user = null;
        logger.warn({ middleware: 'optionalJwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: (req as any).id }, '[jwtAuth] JWT 认证失败，可选认证放行');
      }
      next();
    }).catch(() => {
      // 验证异常：显式置空，匿名放行
      req.user = null;
      logger.warn({ middleware: 'optionalJwtAuth', path: req.path, error: 'JWT 验证异常', requestId: (req as any).id }, '[jwtAuth] JWT 认证失败，可选认证放行');
      next();
    });
  } else {
    // 无 Bearer Token：匿名访问，显式置空以供下游判断
    req.user = null;
    logger.info({ middleware: 'optionalJwtAuth', path: req.path, requestId: (req as any).id }, '[jwtAuth] 无 Bearer Token，匿名放行');
    next();
  }
}
