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
import { getUserById } from '../services/userService.js';
import { verifyApiKey } from '../services/apiKeyService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';

// jose 密钥类型：非对称密钥为 CryptoKey，对称密钥为 Uint8Array
type JoseKey = CryptoKey | Uint8Array;

/** 组织内成员角色（owner 为组织创建者） */
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'readonly';

/**
 * 令牌中携带的多租户上下文（ADR-032）。
 *
 * 企业理由：多租户隔离要求每个请求都能确定"当前活跃租户"。将其嵌入 JWT
 * 使无状态鉴权链（中间件）无需额外 DB 往返即可解析租户，再交由 withTenant
 * 在事务内激活 RLS。org_role 为租户内角色，platform_admin 用于运营 SaaS 自身。
 */
export interface TenantContext {
  /** 活跃组织（租户）UUID */
  tenantId?: string;
  /** 在活跃组织内的成员角色 */
  orgRole?: OrgRole;
  /** 平台管理员标记（运营 SaaS 自身，区别于租户内 admin） */
  platformAdmin?: boolean;
}

/** JWT payload 结构 */
export interface JwtPayload {
  /** 用户 ID */
  sub: string;
  /** 用户角色（全局/legacy RBAC 角色，由 org_role 派生以兼容既有 requirePermission） */
  role: 'admin' | 'analyst' | 'readonly';
  /** 活跃组织（租户）UUID — 多租户上下文，未加入任何组织时缺省 */
  tenant_id?: string;
  /** 在活跃组织内的成员角色 */
  org_role?: OrgRole;
  /** 平台管理员标记（运营 SaaS 自身） */
  platform_admin?: boolean;
  /** 签发时间（秒级时间戳） */
  iat: number;
  /** 过期时间（秒级时间戳） */
  exp: number;
}

/** 扩展 Express Request，附加解码后的用户信息 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload | null;
  /** 由租户解析中间件注入的当前活跃租户（组织）UUID，供 withTenant 激活 RLS */
  tenantId?: string;
}

/**
 * 为 pino-http 请求 logger 注入脱敏用户上下文（T-B2）。
 *
 * 企业理由：排障时需关联 user_id/role，但日志中不应出现明文 sub/email。
 */
function hashUserId(sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  return crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16);
}

function attachAuthLogContext(req: AuthenticatedRequest): void {
  const sub = req.user?.sub;
  if (!sub) return;
  const reqWithLog = req as AuthenticatedRequest & {
    log?: { child: (b: object) => { child: (b: object) => unknown } };
  };
  if (reqWithLog.log && typeof reqWithLog.log.child === 'function') {
    const userId = hashUserId(sub);
    reqWithLog.log = reqWithLog.log.child({
      user_id: userId,
      role: req.user?.role,
    }) as typeof reqWithLog.log;
  }
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

/** 合法角色集合，用于拒绝伪造或缺失的 role 声明 */
const VALID_JWT_ROLES = new Set<JwtPayload['role']>(['admin', 'analyst', 'readonly']);

/**
 * 校验 JWT payload 是否包含全部必需声明且类型合法。
 *
 * 企业理由（Security / RFC 8725）：jose 的 jwtVerify 只校验签名与 alg，
 * 不强制要求自定义声明存在。若放行缺失声明的令牌将导致：
 * - 缺 exp：令牌永不过期，无法通过到期吊销；
 * - 缺 sub：下游 user.sub 为 undefined，用户维度的鉴权与审计失效；
 * - 缺/伪造 role：RBAC 角色判定异常，可能越权。
 * 因此必须显式拒绝缺失或非法声明的令牌。
 *
 * @param payload - jwtVerify 解码后的 payload
 * @returns 声明齐备且合法返回 true，否则 false
 */
function hasRequiredClaims(payload: JwtPayload): boolean {
  return (
    typeof payload.sub === 'string' &&
    payload.sub.length > 0 &&
    VALID_JWT_ROLES.has(payload.role) &&
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp)
  );
}

/**
 * 验证并解码 JWT
 *
 * 企业理由：验证时先尝试 RS256，失败后回退 HS256，确保迁移期间
 * 新旧令牌均可验证。jose 库的 jwtVerify 强制校验 alg 声明，
 * 自动拒绝 alg:none 令牌，从根本上防御算法混淆攻击。
 * 验证通过后还须经 hasRequiredClaims 校验 sub/role/exp 声明，
 * 拒绝缺失关键声明的"半合法"令牌。
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
    const jwtPayload = payload as unknown as JwtPayload;
    if (!hasRequiredClaims(jwtPayload)) {
      return null;
    }
    if (await isAccessTokenRevokedForUser(jwtPayload.sub, jwtPayload.iat)) {
      return null;
    }
    return jwtPayload;
  } catch {
    // RS256 验证失败，按策略决定是否回退 HS256
  }

  // 2. 回退 HS256 验证（仅在显式启用 HS256 时）
  //
  // Security (ADR：T-05 / RFC 8725 §3.1)：禁止"先 RS256 再无条件 HS256"的双算法接受策略。
  // 企业为何需要：若服务端同时接受 RS256 与 HS256，攻击者可用服务端 RS256 公钥作为 HS256 的
  //   对称密钥伪造令牌（算法混淆攻击）；或在 JWT_SECRET 偏弱时离线爆破伪造 HS256 令牌。
  // 做法：仅当配置算法本身为 HS256（开发/显式过渡）时才尝试 HS256；生产默认 RS256，HS256 通道关闭。
  // 权衡：若需 HS256→RS256 迁移期同时验证两类令牌，应通过显式临时开关而非默认行为。
  if (JWT_ALGORITHM !== 'HS256') {
    return null;
  }
  try {
    const key = await getOrCacheHS256Key();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    const jwtPayload = payload as unknown as JwtPayload;
    if (!hasRequiredClaims(jwtPayload)) {
      return null;
    }
    if (await isAccessTokenRevokedForUser(jwtPayload.sub, jwtPayload.iat)) {
      return null;
    }
    return jwtPayload;
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
  familyId: string; // Token 家族 ID，用于复用检测
  // 多租户上下文（ADR-032）：刷新时据此重签发携带相同租户上下文的 access token，
  // 避免刷新后丢失活跃组织（否则用户每次刷新都被"踢出"当前租户）。
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}

/** 从 refresh token entry 提取多租户上下文 */
function tenantFromEntry(entry: RefreshTokenEntry): TenantContext {
  return { tenantId: entry.tenantId, orgRole: entry.orgRole, platformAdmin: entry.platformAdmin };
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
  lastToken: string; // 家族中最新有效的 token
  revoked: boolean; // 整个家族是否已被撤销
}

/** Redis Key 前缀 */
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const TOKEN_FAMILY_PREFIX = 'token_family:';
const USER_FAMILIES_PREFIX = 'user_families:';
const USER_REVOKED_PREFIX = 'user_revoked:';

/** 内存回退存储（Redis 不可用时使用） */
const fallbackRefreshTokenStore = new Map<string, RefreshTokenEntry>();
const fallbackTokenFamilyStore = new Map<string, TokenFamilyEntry>();
const fallbackUserFamilies = new Map<string, Set<string>>();
const fallbackUserRevokedAt = new Map<string, number>();

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

/** 非数据库用户（跳过 is_active 校验） */
const SYSTEM_USER_IDS = new Set(['dev-user', 'api-key-user']);

/**
 * 校验数据库用户是否仍可认证（账户停用/匿名化后拒绝 JWT 与 refresh）。
 *
 * @param userId - JWT sub 或 refresh token 中的 userId
 * @returns 系统占位用户恒为 true；数据库用户须存在且 is_active
 */
async function isUserSessionValid(userId: string): Promise<boolean> {
  if (SYSTEM_USER_IDS.has(userId)) return true;
  try {
    const user = await getUserById(userId);
    return user !== null && user.isActive;
  } catch (err) {
    logger.warn({ err: String(err), userId }, '[jwtAuth] 用户状态查询失败，拒绝会话');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token 生成与刷新
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
 * @param tenant - 可选的多租户上下文，随 token 持久化以便刷新时重签发
 * @returns 随机 Refresh Token 字符串
 */
export async function generateRefreshToken(
  userId: string,
  role: 'admin' | 'analyst' | 'readonly',
  existingFamilyId?: string,
  tenant?: TenantContext,
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
    tenantId: tenant?.tenantId,
    orgRole: tenant?.orgRole,
    platformAdmin: tenant?.platformAdmin,
  };

  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      // 存储 refresh token，带 TTL 自动过期
      await appRedis.set(`${REFRESH_TOKEN_PREFIX}${token}`, JSON.stringify(entry), 'EX', ttlSec);

      // 更新 token family 记录
      const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
      await appRedis.set(
        familyKey,
        JSON.stringify({ lastToken: token, revoked: false } satisfies TokenFamilyEntry),
        'EX',
        ttlSec,
      );

      const userFamiliesKey = `${USER_FAMILIES_PREFIX}${userId}`;
      await appRedis.sadd(userFamiliesKey, familyId);
      await appRedis.expire(userFamiliesKey, ttlSec);

      logger.info({ userId, familyId }, '[jwtAuth] Redis: Refresh Token 已存储');
    } catch (err) {
      logger.warn({ err: String(err) }, '[jwtAuth] Redis 存储失败，回退到内存');
      redisAvailable = false;
      fallbackRefreshTokenStore.set(token, entry);
      fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
      trackUserFamilyMemory(userId, familyId);
    }
  } else {
    // 内存回退
    fallbackRefreshTokenStore.set(token, entry);
    fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
    trackUserFamilyMemory(userId, familyId);
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

    if (!(await isUserSessionValid(entry.userId))) {
      await appRedis.del(tokenKey);
      logger.warn({ userId: hashUserId(entry.userId) }, '[jwtAuth] 用户已停用，拒绝 refresh');
      return null;
    }

    // 检查 family 是否已被撤销
    const familyKey = `${TOKEN_FAMILY_PREFIX}${entry.familyId}`;
    const familyRaw = await appRedis.get(familyKey);
    if (familyRaw) {
      const family: TokenFamilyEntry = JSON.parse(familyRaw);
      if (family.revoked) {
        logger.warn(
          { familyId: entry.familyId },
          '[jwtAuth] Token family 已被撤销（复用检测触发），拒绝刷新',
        );
        await appRedis.del(tokenKey);
        return null;
      }
    }

    // 正常刷新：将旧 token 标记为"已使用"（用于复用检测），而非直接删除
    // 企业理由：保留旧 token 的 familyId 映射，使复用检测能识别已使用的 token
    const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
    await appRedis.set(
      usedKey,
      JSON.stringify({ familyId: entry.familyId }),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );
    await appRedis.del(tokenKey);

    // 签发新 token 对（保留多租户上下文）
    const tenant = tenantFromEntry(entry);
    const accessToken = await generateToken(entry.userId, entry.role, tenant);
    const newRefreshToken = await generateRefreshToken(
      entry.userId,
      entry.role,
      entry.familyId,
      tenant,
    );

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
    logger.warn({ familyId }, '[jwtAuth] 检测到 Refresh Token 复用！撤销整个 Token Family');

    const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
    await appRedis.set(
      familyKey,
      JSON.stringify({ lastToken: '', revoked: true }),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );

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
    logger.warn(
      { familyId: usedEntry.familyId },
      '[jwtAuth] 内存模式：检测到 Refresh Token 复用！撤销整个 Token Family',
    );
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

  if (!(await isUserSessionValid(entry.userId))) {
    fallbackRefreshTokenStore.delete(refreshToken);
    logger.warn(
      { userId: hashUserId(entry.userId) },
      '[jwtAuth] 内存模式：用户已停用，拒绝 refresh',
    );
    return null;
  }

  // 检查 family 是否已被撤销
  const family = fallbackTokenFamilyStore.get(entry.familyId);
  if (family?.revoked) {
    logger.warn(
      { familyId: entry.familyId },
      '[jwtAuth] 内存模式：Token family 已被撤销，拒绝刷新',
    );
    fallbackRefreshTokenStore.delete(refreshToken);
    return null;
  }

  // 将旧 token 标记为"已使用"（用于复用检测），而非直接删除
  fallbackRefreshTokenStore.set(`used:${refreshToken}`, entry);
  fallbackRefreshTokenStore.delete(refreshToken);

  // 签发新 token 对（保留多租户上下文）
  const tenant = tenantFromEntry(entry);
  const accessToken = await generateToken(entry.userId, entry.role, tenant);
  const newRefreshToken = await generateRefreshToken(
    entry.userId,
    entry.role,
    entry.familyId,
    tenant,
  );

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
        await appRedis.set(
          familyKey,
          JSON.stringify({ lastToken: '', revoked: true }),
          'EX',
          REFRESH_TOKEN_EXPIRES_IN_SEC,
        );
        await appRedis.del(tokenKey);
        logger.info(
          { familyId: entry.familyId },
          '[jwtAuth] Redis: Refresh Token 及其 Family 已撤销',
        );
      }

      // 也检查 used token
      const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
      const usedRaw = await appRedis.get(usedKey);
      if (usedRaw) {
        const { familyId } = JSON.parse(usedRaw) as { familyId: string };
        const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
        await appRedis.set(
          familyKey,
          JSON.stringify({ lastToken: '', revoked: true }),
          'EX',
          REFRESH_TOKEN_EXPIRES_IN_SEC,
        );
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
  const entry =
    fallbackRefreshTokenStore.get(refreshToken) ||
    fallbackRefreshTokenStore.get(`used:${refreshToken}`);
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

function trackUserFamilyMemory(userId: string, familyId: string): void {
  const families = fallbackUserFamilies.get(userId) ?? new Set<string>();
  families.add(familyId);
  fallbackUserFamilies.set(userId, families);
}

/**
 * 判断 Access Token 是否在用户全局会话撤销之后签发。
 */
async function isAccessTokenRevokedForUser(userId: string, tokenIat: number): Promise<boolean> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const raw = await appRedis.get(`${USER_REVOKED_PREFIX}${userId}`);
      if (!raw) return false;
      const revokedAt = Number.parseInt(raw, 10);
      return Number.isFinite(revokedAt) && tokenIat <= revokedAt;
    } catch {
      // 回退内存
    }
  }

  const revokedAt = fallbackUserRevokedAt.get(userId);
  return revokedAt !== undefined && tokenIat <= revokedAt;
}

async function revokeTokenFamilyRedis(familyId: string): Promise<void> {
  const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
  const familyRaw = await appRedis.get(familyKey);
  if (familyRaw) {
    const family = JSON.parse(familyRaw) as TokenFamilyEntry;
    if (family.lastToken) {
      await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
    }
  }
  await appRedis.set(
    familyKey,
    JSON.stringify({ lastToken: '', revoked: true } satisfies TokenFamilyEntry),
    'EX',
    REFRESH_TOKEN_EXPIRES_IN_SEC,
  );
}

function revokeTokenFamilyMemory(familyId: string): void {
  const family = fallbackTokenFamilyStore.get(familyId);
  if (family) {
    if (family.lastToken) {
      fallbackRefreshTokenStore.delete(family.lastToken);
    }
    family.revoked = true;
  }
}

function revokeAllUserSessionsMemory(userId: string, revokedAt: number): void {
  const familyIds = fallbackUserFamilies.get(userId);
  if (familyIds) {
    for (const familyId of familyIds) {
      revokeTokenFamilyMemory(familyId);
    }
    fallbackUserFamilies.delete(userId);
  }

  for (const key of [...fallbackRefreshTokenStore.keys()]) {
    const entry = fallbackRefreshTokenStore.get(key);
    if (entry?.userId === userId) {
      fallbackRefreshTokenStore.delete(key);
    }
  }

  fallbackUserRevokedAt.set(userId, revokedAt);
}

/**
 * 撤销用户全部会话（Refresh Token 家族 + 现有 Access Token）。
 *
 * 企业理由：账户删除/安全事件须使所有已签发令牌失效，防止匿名化后仍可用旧 JWT 访问 API。
 *
 * @param userId - 用户 ID
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const familiesKey = `${USER_FAMILIES_PREFIX}${userId}`;
      const familyIds = await appRedis.smembers(familiesKey);
      for (const familyId of familyIds) {
        await revokeTokenFamilyRedis(familyId);
      }
      if (familyIds.length > 0) {
        await appRedis.del(familiesKey);
      }

      await appRedis.set(
        `${USER_REVOKED_PREFIX}${userId}`,
        String(revokedAt),
        'EX',
        REFRESH_TOKEN_EXPIRES_IN_SEC,
      );
      logger.info({ userId, familyCount: familyIds.length }, '[jwtAuth] Redis: 用户全部会话已撤销');
      return;
    } catch (err) {
      logger.warn({ err: String(err), userId }, '[jwtAuth] Redis 批量撤销失败，回退到内存');
      redisAvailable = false;
    }
  }

  revokeAllUserSessionsMemory(userId, revokedAt);
  logger.info({ userId }, '[jwtAuth] 内存模式：用户全部会话已撤销');
}

/**
 * 验证 Access Token，返回解码后的 payload
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return verifyJwt(token);
}

/**
 * 将 x-api-key 解析为认证用户上下文（ADR-033）。
 *
 * 解析优先级：
 * 1. 按组织的 DB 密钥（api_keys 表）——主路径。命中则注入租户上下文
 *    `{ sub: 'apikey:<keyId>', role/org_role: 'analyst', tenant_id: orgId }`，
 *    交由 RLS 隔离数据。
 * 2. 可选的 `ADMIN_API_KEY` 破窗（break-glass）平台密钥——仅用于平台运维应急，
 *    注入 `platform_admin: true` 且不绑定租户。生产应优先用按组织密钥，
 *    将 ADMIN_API_KEY 视为最后手段并妥善保管。
 *
 * @param apiKey - 客户端提供的明文 x-api-key
 * @returns 解析出的 JwtPayload，无效时返回 null
 */
async function resolveApiKeyUser(apiKey: string): Promise<JwtPayload | null> {
  if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > 128) {
    return null;
  }
  const nowSec = Math.floor(Date.now() / 1000);

  // 1) 按组织的 DB 密钥（主路径）
  const verified = await verifyApiKey(apiKey);
  if (verified) {
    return {
      sub: `apikey:${verified.keyId}`,
      role: 'analyst',
      tenant_id: verified.orgId,
      org_role: 'analyst',
      iat: nowSec,
      exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
    };
  }

  // 2) 可选 ADMIN_API_KEY 破窗平台密钥
  if (config.ADMIN_API_KEY && apiKey.length === config.ADMIN_API_KEY.length) {
    const a = Buffer.from(apiKey, 'utf-8');
    const b = Buffer.from(config.ADMIN_API_KEY, 'utf-8');
    if (crypto.timingSafeEqual(a, b)) {
      return {
        sub: 'platform:break-glass',
        role: 'admin',
        platform_admin: true,
        iat: nowSec,
        exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
      };
    }
  }

  return null;
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
/** 开发旁路认证：仅开发环境且显式开启时注入 readonly 占位用户 */
function tryDevBypass(req: AuthenticatedRequest, next: NextFunction): boolean {
  if (
    !(
      config.NODE_ENV === 'development' &&
      config.DEV_SKIP_AUTH &&
      config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production'
    )
  ) {
    return false;
  }
  logger.info({ middleware: 'jwtAuth', path: req.path }, '[jwtAuth] 开发旁路认证（readonly）');
  req.user = {
    sub: 'dev-user',
    role: 'readonly',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
  };
  attachAuthLogContext(req);
  next();
  return true;
}

/** 处理 Bearer Token 认证流程（含吊销/停用检查） */
function handleBearerTokenAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = req.headers.authorization!.slice(7).trim();
  verifyJwt(token)
    .then(async (payload) => {
      if (!payload) {
        logger.warn(
          { middleware: 'jwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: req.id },
          '[jwtAuth] JWT 认证失败',
        );
        sendProblem(res, 401, 'INVALID_TOKEN', 'Unauthorized', { detail: 'JWT token 无效或已过期' });
        return;
      }
      if (await isAccessTokenRevokedForUser(payload.sub, payload.iat)) {
        logger.warn(
          { middleware: 'jwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id },
          '[jwtAuth] 会话已全局撤销，拒绝访问',
        );
        sendProblem(res, 401, 'SESSION_REVOKED', 'Unauthorized', { detail: '会话已失效，请重新登录' });
        return;
      }
      if (!(await isUserSessionValid(payload.sub))) {
        logger.warn(
          { middleware: 'jwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id },
          '[jwtAuth] 用户已停用，拒绝访问',
        );
        sendProblem(res, 401, 'ACCOUNT_DISABLED', 'Unauthorized', { detail: '账户已停用或已删除' });
        return;
      }
      req.user = payload;
      attachAuthLogContext(req);
      logger.info(
        { middleware: 'jwtAuth', path: req.path, userId: hashUserId(req.user?.sub), role: req.user?.role, requestId: req.id },
        '[jwtAuth] JWT 认证通过',
      );
      next();
    })
    .catch((err) => {
      logger.warn(
        { middleware: 'jwtAuth', path: req.path, error: String(err), requestId: req.id },
        '[jwtAuth] JWT 验证异常',
      );
      sendProblem(res, 401, 'INVALID_TOKEN', 'Unauthorized', { detail: 'JWT token 无效或已过期' });
    });
}

/** 处理 x-api-key 兼容认证（DB 按组织密钥 + 可选破窗平台密钥，ADR-033） */
function handleApiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) return;
  resolveApiKeyUser(apiKey)
    .then((user) => {
      if (user) {
        req.user = user;
        attachAuthLogContext(req);
        logger.info(
          { middleware: 'jwtAuth', path: req.path, userId: hashUserId(req.user.sub), role: req.user.role, tenantId: req.user.tenant_id, requestId: req.id },
          '[jwtAuth] API Key 认证通过',
        );
        next();
        return;
      }
      logger.warn({ middleware: 'jwtAuth', path: req.path, error: 'API Key 无效', requestId: req.id }, '[jwtAuth] JWT 认证失败');
      sendProblem(res, 401, 'INVALID_API_KEY', 'Unauthorized', { detail: 'API Key 无效' });
    })
    .catch((err) => {
      logger.warn({ middleware: 'jwtAuth', path: req.path, error: String(err), requestId: req.id }, '[jwtAuth] API Key 验证异常');
      sendProblem(res, 401, 'INVALID_API_KEY', 'Unauthorized', { detail: 'API Key 无效' });
    });
}

export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  logger.info(
    { middleware: 'jwtAuth', path: req.path, method: req.method, requestId: req.id },
    '[jwtAuth] JWT 认证检查',
  );

  if (tryDevBypass(req, next)) return;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    handleBearerTokenAuth(req, res, next);
    return;
  }

  if (req.headers['x-api-key']) {
    handleApiKeyAuth(req, res, next);
    return;
  }

  logger.warn(
    { middleware: 'jwtAuth', path: req.path, error: '缺少认证凭证', requestId: req.id },
    '[jwtAuth] JWT 认证失败',
  );
  sendProblem(res, 401, 'MISSING_CREDENTIALS', 'Unauthorized', {
    detail: '缺少认证凭证，请提供 Bearer Token 或 x-api-key',
  });
}

/**
 * 可选 JWT 认证中间件
 *
 * 企业理由：部分端点（如回测执行）需要识别用户身份但不强制要求认证，
 * 未认证用户以 readonly 角色访问。
 * 权衡：可选认证降低了安全门槛，但渐进式引入比一刀切更可行。
 */
/** 可选模式：处理 Bearer Token，失败时匿名放行 */
function handleOptionalBearer(req: AuthenticatedRequest, next: NextFunction): void {
  const token = req.headers.authorization!.slice(7).trim();
  verifyJwt(token)
    .then((payload) => {
      if (payload) {
        req.user = payload;
        attachAuthLogContext(req);
        logger.info(
          { middleware: 'optionalJwtAuth', path: req.path, userId: hashUserId(req.user?.sub), role: req.user?.role, requestId: req.id },
          '[jwtAuth] JWT 认证通过',
        );
      } else {
        req.user = null;
        logger.warn(
          { middleware: 'optionalJwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: req.id },
          '[jwtAuth] JWT 认证失败，可选认证放行',
        );
      }
      next();
    })
    .catch(() => {
      req.user = null;
      logger.warn(
        { middleware: 'optionalJwtAuth', path: req.path, error: 'JWT 验证异常', requestId: req.id },
        '[jwtAuth] JWT 认证失败，可选认证放行',
      );
      next();
    });
}

/** 可选模式：处理 x-api-key，失败时匿名放行 */
function handleOptionalApiKey(req: AuthenticatedRequest, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    req.user = null;
    logger.info(
      { middleware: 'optionalJwtAuth', path: req.path, requestId: req.id },
      '[jwtAuth] 无 Bearer Token，匿名放行',
    );
    next();
    return;
  }
  resolveApiKeyUser(apiKey)
    .then((user) => {
      if (user) {
        req.user = user;
        attachAuthLogContext(req);
        logger.info(
          { middleware: 'optionalJwtAuth', path: req.path, userId: hashUserId(req.user.sub), role: req.user.role, tenantId: req.user.tenant_id, requestId: req.id },
          '[jwtAuth] API Key 认证通过',
        );
      } else {
        req.user = null;
        logger.info(
          { middleware: 'optionalJwtAuth', path: req.path, requestId: req.id },
          '[jwtAuth] API Key 无效，匿名放行',
        );
      }
      next();
    })
    .catch(() => {
      req.user = null;
      next();
    });
}

export function optionalJwtAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  logger.info(
    { middleware: 'optionalJwtAuth', path: req.path, method: req.method, requestId: req.id },
    '[jwtAuth] 可选 JWT 认证检查',
  );
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    handleOptionalBearer(req, next);
  } else {
    handleOptionalApiKey(req, next);
  }
}

/**
 * 为未认证请求注入 readonly 访客身份。
 *
 * 配合 optionalJwtAuth + requirePermission(DATA_READ) 使用，
 * 使数据引擎只读端点（stats/status/tickers）在开发环境无需登录即可访问。
 */
export function assignGuestReadonly(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    req.user = {
      sub: 'guest',
      role: 'readonly',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
    };
    attachAuthLogContext(req);
  }
  next();
}
