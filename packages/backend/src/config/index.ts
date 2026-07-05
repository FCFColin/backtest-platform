/**
 * 集中配置模块
 *
 * 统一管理所有环境变量，提供合理的开发环境默认值，
 * 并通过 `validateConfig()` 在启动时校验必需配置。
 *
 * 使用方式：
 *   import { config, validateConfig } from './config/index.js';
 *   validateConfig(); // 启动时调用
 *   console.log(config.API_PORT);
 */

import dotenv from 'dotenv';

// 加载 .env 文件（若存在），使环境变量在 config 对象构造时可用
dotenv.config();

/**
 * 应用运行环境类型
 */
export type NodeEnv = 'development' | 'production' | 'test';

/**
 * CORS 来源配置类型
 * - `true`：允许所有来源（默认，开发友好）
 * - `string[]`：仅允许指定来源
 */
export type CorsOrigins = true | string[];

/**
 * 解析 CORS_ORIGINS 环境变量。
 *
 * @param raw - 原始环境变量值
 * @returns `true` 表示允许所有来源；否则返回来源数组
 */
function parseCorsOrigins(raw: string | undefined): CorsOrigins {
  if (!raw || raw.trim() === '' || raw.trim() === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 集中配置对象
 *
 * 汇总全部环境变量，提供开发环境友好的默认值。
 * 生产环境部署时请通过环境变量或 `.env` 文件覆盖。
 */
export const config = {
  /**
   * 当前运行环境。
   * - `development`：开发环境（默认，错误详情会返回客户端便于调试）
   * - `production`：生产环境（需设置 `ADMIN_API_KEY`，隐藏错误详情）
   * - `test`：测试环境
   */
  NODE_ENV: (process.env.NODE_ENV || 'development') as NodeEnv,

  /**
   * 托管前端 dist/ 静态资源（与生产/Docker 一致）。
   *
   * 开发环境设 `SERVE_STATIC=true` 时，API 直接服务预构建产物，
   * 避免 Vite dev 按需编译导致首屏 60s+。`npm run dev` 默认启用。
   * @default false（显式开启或由 dev 脚本注入）
   */
  SERVE_STATIC: process.env.SERVE_STATIC === 'true',

  /**
   * API 服务监听端口。
   *
   * 兼容旧变量 `PORT`（`API_PORT` 优先级更高）。
   * @default 5001
   */
  API_PORT: parseInt(process.env.API_PORT || process.env.PORT || '5001', 10),

  /**
   * Go 引擎服务地址（唯一回测引擎，ADR-008 / ADR-031）。
   *
   * 企业理由（ADR-008）：Go 引擎是平台唯一的回测/分析/优化/蒙特卡洛引擎，
   * Go 服务默认监听 5004（见 engine-go/cmd/server/main.go 与 tests/helpers/constants.ts）。
   * 此前默认值误写为 5002（Rust 引擎端口），导致 Go 引擎调用始终失败并静默降级到 Node，
   * 现统一为 5004，消除端口矛盾。
   * Go 在并发模型（goroutine vs async）、开发效率和生态上优于 Rust。
   * 不可用时按 fail-closed 策略返回 503/重试（ADR-031），不再静默返回 Node 计算结果。
   * @default "http://127.0.0.1:5004"
   */
  GO_ENGINE_URL: process.env.GO_ENGINE_URL || 'http://127.0.0.1:5004',

  /**
   * Go 引擎调用超时时间（毫秒）。
   *
   * 企业理由（ADR-031）：超时后熔断器记一次失败；引擎持续不可用时 fail-closed
   * 返回 503 + Retry-After，不再静默降级到 Node。
   * 兼容旧变量名 RUST_ENGINE_TIMEOUT_MS（Rust 退役前的历史名）。
   * @default 5000
   */
  ENGINE_TIMEOUT_MS: parseInt(
    process.env.ENGINE_TIMEOUT_MS || process.env.RUST_ENGINE_TIMEOUT_MS || '5000',
    10,
  ),

  /**
   * Go 数据服务地址（主数据源）。
   *
   * 不可用时降级到 PostgreSQL（Go 服务不可用时由 API 直接查库）。
   * @default "http://127.0.0.1:5003"
   */
  GO_DATA_SERVICE_URL: process.env.GO_DATA_SERVICE_URL || 'http://127.0.0.1:5003',

  /**
   * Go 引擎认证 token（X-Engine-Auth 请求头）。
   *
   * 企业理由：engine-go 暴露计算密集型 API，无认证时任意调用方可消耗 CPU 资源引发 DoS。
   * API 服务调用 engine-go 时通过此 token 进行服务间认证。
   * 必须与 engine-go 服务的 ENGINE_AUTH_TOKEN 环境变量保持一致。
   * 生产环境必须设置为强随机值（>= 32 字符），禁止使用默认 dev 值。
   * @default "dev-engine-auth-token"
   */
  ENGINE_AUTH_TOKEN: process.env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token',

  /**
   * Go 数据服务认证 token（X-Data-Service-Auth 请求头）。
   *
   * 企业理由：data-fetcher 暴露行情数据和 baostock 实时查询 API，
   * 无认证时任意调用方可消耗外部 API 配额和磁盘 I/O 资源。
   * API 服务调用 data-fetcher 时通过此 token 进行服务间认证。
   * 必须与 data-fetcher 服务的 DATA_SERVICE_AUTH_TOKEN 环境变量保持一致。
   * 生产环境必须设置为强随机值（>= 32 字符），禁止使用默认 dev 值。
   * @default "dev-data-service-auth-token"
   */
  DATA_SERVICE_AUTH_TOKEN: process.env.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token',

  /**
   * 允许的 CORS 来源。
   *
   * - 未设置或 `*`：允许所有来源（默认，开发友好）
   * - 多个来源用逗号分隔，如 `"http://localhost:5173,https://example.com"`
   * @default true（允许所有来源）
   */
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS),

  /**
   * 管理后台 API 密钥。
   *
   * 生产环境（`NODE_ENV=production`）下必需，否则 `validateConfig()` 将抛出错误。
   * 开发环境可留空。
   * @default ""
   */
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',

  /**
   * 是否强制要求 API Key 认证。
   *
   * 企业理由：计算密集型端点需要认证保护，防止未授权调用消耗计算资源。
   * 设为 true 时，optionalApiKey 中间件退化为 requireApiKey，
   * 所有业务端点强制要求 API Key。
   * @default false
   */
  REQUIRE_API_KEY: process.env.REQUIRE_API_KEY === 'true',

  /**
   * 开发环境显式跳过 JWT 认证（ADR-026 / T-32）。
   * 仅当 NODE_ENV=development 且为 true 时，jwtAuth 注入 readonly 占位用户。
   * 生产环境忽略此开关。
   */
  DEV_SKIP_AUTH: process.env.DEV_SKIP_AUTH === 'true',

  /**
   * JWT 签名密钥（T-P1-8）。
   *
   * 企业理由：JWT 提供有状态会话管理（过期、刷新、角色嵌入），
   * 是企业级 SaaS 的认证标准。密钥必须通过环境变量注入，禁止硬编码。
   * 开发环境使用固定默认值方便本地联调，生产环境必须覆盖。
   * @default "dev-only-jwt-secret-change-in-production"
   */
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-jwt-secret-change-in-production',

  /**
   * JWT Access Token 有效期（秒）。
   * @default 900（15 分钟）
   */
  JWT_ACCESS_TTL: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),

  /**
   * JWT Refresh Token 有效期（秒）。
   * @default 604800（7 天）
   */
  JWT_REFRESH_TTL: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),

  /**
   * JWT 签名算法。
   *
   * 企业理由：RS256 使用非对称密钥（私钥签名、公钥验证），支持：
   * 1. alg=none 攻击防护——jose 库强制校验算法声明，拒绝 alg:none 令牌；
   * 2. OIDC/SSO 集成——IdP 公钥验证需要 RS256 或 ES256；
   * 3. 密钥轮换——公钥可独立分发，私钥泄露后只需轮换私钥，无需更新所有验证方。
   *
   * 开发环境默认 HS256（向后兼容），生产环境默认 RS256。
   * @default 'RS256'（生产）/ 'HS256'（开发）
   */
  JWT_ALGORITHM: (process.env.JWT_ALGORITHM ||
    ((process.env.NODE_ENV || 'development') === 'production' ? 'RS256' : 'HS256')) as
    'RS256' | 'HS256',

  /**
   * RSA 私钥（PEM 格式）。
   *
   * 企业理由：RS256 签名需要私钥。生产环境必须通过环境变量或文件注入，
   * 禁止硬编码。支持两种配置方式：
   * 1. 直接设置 JWT_PRIVATE_KEY 环境变量（PEM 内容）
   * 2. 设置 JWT_PRIVATE_KEY_FILE 环境变量指向 PEM 文件路径
   * 开发环境未配置时自动生成临时密钥对（仅用于本地调试）。
   * @default ""（开发环境自动生成）
   */
  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || '',

  /**
   * RSA 私钥文件路径（PEM 格式）。
   *
   * 当 JWT_PRIVATE_KEY 未直接设置时，可指定 PEM 文件路径。
   * @default ""
   */
  JWT_PRIVATE_KEY_FILE: process.env.JWT_PRIVATE_KEY_FILE || '',

  /**
   * RSA 公钥（PEM 格式）。
   *
   * 企业理由：RS256 验证需要公钥。公钥可安全分发，验证方无需持有私钥。
   * 支持两种配置方式：
   * 1. 直接设置 JWT_PUBLIC_KEY 环境变量（PEM 内容）
   * 2. 设置 JWT_PUBLIC_KEY_FILE 环境变量指向 PEM 文件路径
   * 开发环境未配置时自动生成临时密钥对（仅用于本地调试）。
   * @default ""（开发环境自动生成）
   */
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',

  /**
   * RSA 公钥文件路径（PEM 格式）。
   *
   * 当 JWT_PUBLIC_KEY 未直接设置时，可指定 PEM 文件路径。
   * @default ""
   */
  JWT_PUBLIC_KEY_FILE: process.env.JWT_PUBLIC_KEY_FILE || '',

  /**
   * PostgreSQL 数据库连接 URL（ADR-007）。
   *
   * 企业理由：PostgreSQL 解除 SQLite 单实例限制，支持多副本 K8s 部署。
   * 连接 URL 包含主机/端口/数据库名/用户/密码，通过环境变量注入。
   * 生产环境必须使用 TLS 连接（postgresql://...?sslmode=require）。
   * 开发环境使用本地 PostgreSQL（可通过 docker-compose 启动）。
   * @default "postgresql://backtest:backtest@localhost:5432/backtest"
   */
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://backtest:backtest@localhost:5432/backtest',

  /**
   * PostgreSQL 只读副本连接 URL（读写分离）。
   *
   * 企业理由：100x 流量下读查询走副本，减轻主库连接压力。
   * 读副本通过流复制同步，延迟通常 <100ms，适合回测数据读取。
   * 权衡：读副本有复制延迟，不适合强一致性读场景。
   * 未配置时所有查询走主库（DATABASE_URL）。
   * @default ""（未配置，所有查询走主库）
   */
  DATABASE_READ_URL: process.env.DATABASE_READ_URL || '',

  /**
   * PostgreSQL 查询语句超时时间（毫秒）。
   *
   * 企业理由：慢查询无超时会长期占用连接，20 连接池快速耗尽后全站降级。
   * statement_timeout 在 PostgreSQL 服务端执行，超时自动取消查询并释放连接。
   * 权衡：超时值需平衡正常查询耗时和连接保护。回测批量查询通常 <5s，
   * 10s 留有余量；如遇合法长查询可临时调高或使用 SET LOCAL 覆盖。
   * @default 10000（10 秒）
   */
  DB_STATEMENT_TIMEOUT_MS: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10),

  /**
   * 同步回测端点超时（T-19），防止超大请求长时间占用连接。
   * @default 120000 (2 分钟)
   */
  BACKTEST_SYNC_TIMEOUT_MS: parseInt(process.env.BACKTEST_SYNC_TIMEOUT_MS || '120000', 10),

  /**
   * Redis 连接 URL（BullMQ 任务队列）。
   *
   * Architecture: Redis连接配置，用于BullMQ任务队列
   * 企业为何需要：参数优化（1000组合）和网格搜索（200组合）同步执行阻塞事件循环30-100s
   * 权衡：引入Redis依赖，但异步化后P99从100s+降至<1s
   *
   * @default "redis://localhost:6379"
   */
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  /**
   * PostgreSQL 连接池最大连接数。
   *
   * 企业理由：连接池大小需与 PostgreSQL max_connections 协调，
   * 过大浪费资源，过小请求排队。默认 20 适合中等负载。
   * @default 20
   */
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
  /** 连接池最小空闲连接（T-2 性能） */
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),

  /**
   * 反向代理跳数（Express trust proxy）。
   *
   * 企业理由：部署在 LB/Ingress 之后时须信任 X-Forwarded-For 以正确限流；
   * 直连暴露时应设为 0，防止伪造 XFF 绕过限流。
   * @default 1
   */
  TRUST_PROXY_HOPS: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10),

  /**
   * 计算密集型端点限流上限（次/分钟/IP）。
   * E2E 测试可通过 COMPUTE_RATE_LIMIT_MAX 放宽。
   * @default 10
   */
  COMPUTE_RATE_LIMIT_MAX: parseInt(process.env.COMPUTE_RATE_LIMIT_MAX || '10', 10),

  /**
   * 应用对外基础 URL（用于构造邮件中的验证 / 邀请链接，ADR-035）。
   * @default "http://localhost:5173"
   */
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:5173',

  /**
   * 邮件发送方式（ADR-035）。
   * - `smtp`：经 SMTP 真实投递（需配置 EMAIL_SMTP_*）。
   * - `console`：开发模式，将验证/邀请链接打印到日志，不实际发信（默认）。
   * @default "console"（开发）/ 生产建议 "smtp"
   */
  EMAIL_TRANSPORT: (process.env.EMAIL_TRANSPORT || 'console') as 'smtp' | 'console',

  /** 发件人地址（From 头），如 "Backtest <no-reply@backtest.platform>"。 */
  EMAIL_FROM: process.env.EMAIL_FROM || 'Backtest Platform <no-reply@backtest.local>',

  /** SMTP 主机（EMAIL_TRANSPORT=smtp 时必需）。 */
  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST || '',
  /** SMTP 端口。@default 587 */
  EMAIL_SMTP_PORT: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
  /** SMTP 是否使用 TLS（465 端口通常为 true）。@default false */
  EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE === 'true',
  /** SMTP 用户名（可空，取决于服务商）。 */
  EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER || '',
  /** SMTP 密码（可空）。 */
  EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS || '',

  /**
   * Stripe 密钥与价格配置（ADR-036，Phase 6 计费）。
   * 未配置时计费端点返回 503（计费未启用），不影响其余功能。
   */
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  /** Pro 方案的 Stripe Price ID（price_xxx）。 */
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO || '',
  /** Enterprise 方案的 Stripe Price ID。 */
  STRIPE_PRICE_ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',
};

/**
 * 降级警告文本
 *
 * 当引擎（Go/Rust）不可用、自动降级到 Node.js 备用引擎时，根据是否进行了 drag
 * 近似计算向客户端返回不同的提示文本。集中管理便于统一调整文案。
 */
export const DEGRADED_WARNING = {
  /** 基础降级提示（未区分 drag 场景） */
  BASE: '降级模式：使用 Node.js 备用引擎',
  /** 降级且已对配置了 drag 的组合进行 JS polyfill 近似计算 */
  WITH_DRAG: '降级模式：使用 Node.js 备用引擎（含 drag 近似计算），精度可能略低',
  /** 降级且未进行 drag 计算（drag 等高级功能精度较低） */
  WITHOUT_DRAG: '降级模式：使用 Node.js 备用引擎，drag 等高级功能精度较低',
};

/**
 * 启动时校验配置。
 *
 * 检查必需环境变量是否已设置。生产环境下 `ADMIN_API_KEY` 必需。
 *
 * @throws {Error} 当必需配置缺失时抛出，错误信息包含全部校验失败项
 */
/** 收集 JWT 相关配置校验错误 */
function validateJwtConfig(): string[] {
  const errors: string[] = [];
  if (config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production') {
    errors.push('JWT_SECRET 在生产环境必须修改默认值，请通过环境变量设置');
  } else if (config.JWT_ALGORITHM === 'HS256' && config.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET 在生产环境（HS256）长度必须 >= 32 字符以保证足够熵');
  }
  if (config.JWT_ALGORITHM === 'RS256') {
    if (!config.JWT_PRIVATE_KEY && !config.JWT_PRIVATE_KEY_FILE) {
      errors.push('RS256 模式下 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE 在生产环境必需');
    }
    if (!config.JWT_PUBLIC_KEY && !config.JWT_PUBLIC_KEY_FILE) {
      errors.push('RS256 模式下 JWT_PUBLIC_KEY 或 JWT_PUBLIC_KEY_FILE 在生产环境必需');
    }
  }
  return errors;
}

/** 收集服务间认证 token 校验错误 */
function validateServiceTokens(): string[] {
  const errors: string[] = [];
  if (!config.ENGINE_AUTH_TOKEN || config.ENGINE_AUTH_TOKEN === 'dev-engine-auth-token') {
    errors.push('ENGINE_AUTH_TOKEN 在生产环境必须设置为非默认的强随机值（>= 32 字符）');
  }
  if (
    !config.DATA_SERVICE_AUTH_TOKEN ||
    config.DATA_SERVICE_AUTH_TOKEN === 'dev-data-service-auth-token'
  ) {
    errors.push('DATA_SERVICE_AUTH_TOKEN 在生产环境必须设置为非默认的强随机值（>= 32 字符）');
  }
  return errors;
}

/** 收集生产环境特有的配置校验错误 */
function collectProductionErrors(): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const errors: string[] = [];

  if (!config.ADMIN_API_KEY) {
    errors.push('ADMIN_API_KEY 在生产环境必需，请通过环境变量设置');
  }

  errors.push(...validateJwtConfig());

  // DATABASE_URL 校验（ADR-007）
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL 在生产环境必须通过环境变量设置，禁止使用默认值');
  }

  errors.push(...validateServiceTokens());

  // 强制认证访问计算端点
  if (!config.REQUIRE_API_KEY) {
    errors.push('REQUIRE_API_KEY 在生产环境必须为 true，否则计算端点可被匿名调用引发 DoS');
  }

  // 禁止 CORS 通配
  if (config.CORS_ORIGINS === true) {
    errors.push('CORS_ORIGINS 在生产环境必须配置来源白名单，禁止使用通配（允许所有来源）');
  }

  // 审计/完整性 HMAC 密钥
  const hmacKey = process.env.AUDIT_HMAC_KEY || '';
  if (hmacKey.length < 32) {
    errors.push('AUDIT_HMAC_KEY 在生产环境必需且长度 >= 32（用于审计日志与缓存完整性校验）');
  }

  // 反向代理跳数
  if (process.env.TRUST_PROXY_HOPS === undefined) {
    errors.push(
      'TRUST_PROXY_HOPS 在生产环境必须显式设置（反向代理跳数）；API 可被客户端直连时请设为 0',
    );
  }

  return errors;
}

export function validateConfig(): void {
  const errors: string[] = collectProductionErrors();

  // Security: 非生产环境（development/test）时若使用了 dev 默认密钥，输出警告
  if (config.NODE_ENV !== 'production') {
    if (config.ENGINE_AUTH_TOKEN === 'dev-engine-auth-token') {
      console.warn('[config] 安全警告：ENGINE_AUTH_TOKEN 使用开发默认值，请勿在生产环境使用');
    }
    if (config.DATA_SERVICE_AUTH_TOKEN === 'dev-data-service-auth-token') {
      console.warn('[config] 安全警告：DATA_SERVICE_AUTH_TOKEN 使用开发默认值，请勿在生产环境使用');
    }
    if (config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production') {
      console.warn('[config] 安全警告：JWT_SECRET 使用开发默认值，请勿在生产环境使用');
    }
    if (config.CORS_ORIGINS === true) {
      console.error('[config] 安全警告：CORS_ORIGINS 允许所有来源，生产环境应配置来源白名单');
    }
  }

  if (Number.isNaN(config.TRUST_PROXY_HOPS) || config.TRUST_PROXY_HOPS < 0) {
    errors.push('TRUST_PROXY_HOPS 必须为非负整数');
  }

  // 邮件配置校验（ADR-035）：选择 SMTP 投递时必须提供主机，否则注册/邀请邮件静默丢失。
  if (config.EMAIL_TRANSPORT === 'smtp' && !config.EMAIL_SMTP_HOST) {
    errors.push('EMAIL_TRANSPORT=smtp 时必须设置 EMAIL_SMTP_HOST');
  }

  if (errors.length > 0) {
    throw new Error(`配置校验失败：\n  - ${errors.join('\n  - ')}`);
  }
}
