/**
 * JWT 验证逻辑（从 jwtAuth.ts 拆分）。
 *
 * 集中承载：算法常量、声明校验、jose jwtVerify 调用、RS256→HS256 回退策略。
 * jwtAuth.ts 中间件入口与 optionalJwtAuth / assignGuestReadonly 仍留在原文件，
 * 通过 import { verifyToken } 引用本模块，避免重复实现。
 *
 * 设计要点（RFC 8725）：
 * - alg=none 攻击防护：jose 强制校验 alg 声明
 * - 双算法接受策略禁止：仅当 JWT_ALGORITHM==='HS256' 时才回退 HS256
 * - 声明齐备校验：sub/role/exp 缺一不可，防止 RBAC 越权与永不过期令牌
 *
 * 拆分理由：jwtAuth.ts 原 360+ 行混合验证实现与中间件入口，本拆分让验证逻辑独立可测，
 * 同时让 jwtAuth.ts 聚焦 Express 中间件编排。
 */

import { jwtVerify } from 'jose';
import { trace, type Span } from '@opentelemetry/api';
import { config } from '../config/index.js';
import { getOrCachePublicKey, getOrCacheHS256Key } from './jwtSigner.js';
import { isAccessTokenRevokedForUser } from './refreshToken.js';
import type { JwtPayload } from './authTypes.js';

/** OTel tracer（无 SDK 初始化时返回 NoopTracer，不影响测试与运行） */
const tracer = trace.getTracer('backtest-platform', '1.0.0');

/** JWT 签名算法（从集中配置读取，RS256 或 HS256） */
const JWT_ALGORITHM = config.JWT_ALGORITHM;

/** 合法角色集合，用于拒绝伪造或缺失的 role 声明 */
const VALID_JWT_ROLES = new Set<JwtPayload['role']>(['admin', 'analyst', 'readonly']);

/**
 * 校验 JWT payload 是否包含全部必需声明且类型合法（RFC 8725）。
 * jose 的 jwtVerify 只校验签名与 alg，不强制自定义声明；缺失 exp 令牌永不过期、
 * 缺 sub 用户维度鉴权/审计失效、缺/伪造 role 导致 RBAC 越权。必须显式拒绝。
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
 * 校验 JWT payload 声明并检查会话吊销状态。RS256 与 HS256 两条验证路径共用此逻辑。
 *
 * @param payload - jwtVerify 解码后的原始 payload
 * @param algorithm - 验证通过的算法名，用于 OTel span 属性
 * @param span - 当前 OTel span
 * @returns 声明齐备且会话有效返回 JwtPayload，否则 null
 */
async function validateJwtPayload(
  payload: unknown,
  algorithm: string,
  span: Span,
): Promise<JwtPayload | null> {
  const jwtPayload = payload as unknown as JwtPayload;
  if (!hasRequiredClaims(jwtPayload)) {
    span.setAttribute('verify.result', 'failed_missing_claims');
    return null;
  }
  if (await isAccessTokenRevokedForUser(jwtPayload.sub, jwtPayload.iat)) {
    span.setAttribute('verify.result', 'failed_revoked');
    return null;
  }
  span.setAttribute('verify.algorithm', algorithm);
  span.setAttribute('verify.result', 'success');
  return jwtPayload;
}

/**
 * 验证并解码 JWT。先尝试 RS256，失败后仅在配置为 HS256 时回退 HS256。
 * jose 的 jwtVerify 强制校验 alg 声明自动拒绝 alg:none 令牌；
 * 验证通过后还须经 hasRequiredClaims 校验 sub/role/exp 声明。
 *
 * @param token - JWT 字符串
 * @returns 解码后的 payload，验证失败返回 null
 */
async function verifyJwt(token: string): Promise<JwtPayload | null> {
  return tracer.startActiveSpan('jwt.verifyJwt', async (span) => {
    try {
      // 1. 先尝试 RS256 验证
      try {
        const publicKey = await getOrCachePublicKey();
        const { payload } = await jwtVerify(token, publicKey, {
          algorithms: ['RS256'],
        });
        return validateJwtPayload(payload, 'RS256', span);
      } catch {
        // RS256 验证失败，按策略决定是否回退 HS256
      }

      // 2. 回退 HS256 验证（仅在显式启用 HS256 时）
      // Security (RFC 8725 §3.1)：禁止"先 RS256 再无条件 HS256"双算法接受策略，
      // 防止算法混淆攻击（用 RS256 公钥作 HS256 对称密钥伪造）与 JWT_SECRET 偏弱时离线爆破。
      // 仅当配置算法本身为 HS256（开发/显式过渡）时才尝试；生产默认 RS256，HS256 通道关闭。
      if (JWT_ALGORITHM !== 'HS256') {
        span.setAttribute('verify.result', 'failed');
        return null;
      }
      try {
        const key = await getOrCacheHS256Key();
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
        });
        return validateJwtPayload(payload, 'HS256', span);
      } catch {
        span.setAttribute('verify.result', 'failed');
        return null;
      }
    } finally {
      span.end();
    }
  });
}

/**
 * 验证 Access Token，返回解码后的 payload。
 *
 * @param token - JWT 字符串
 * @returns 验证通过返回 JwtPayload，失败返回 null
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return verifyJwt(token);
}
