# 数据治理（等保三级 8.1.3.1 + 8.1.4.1/4.2 + 8.1.4 数据备份）

> 合并自: data-protection + identity-and-access + backup-restore

## 1. 数据分级

| 级别    | 定义              | 示例                         | 保护                   |
| ------- | ----------------- | ---------------------------- | ---------------------- |
| L4 极高 | 严重法律/财务损失 | 密码哈希、JWT 密钥、API Key  | 加密存储+审计+最小知悉 |
| L3 高   | 商业损失/隐私违规 | 用户信息、组织财务、回测策略 | RLS+审计+TLS           |
| L2 中   | 有限影响          | 回测结果、组合配置           | RLS+TLS                |
| L1 低   | 公开数据          | 行情、指数、CPI              | 无特殊保护             |

PII 字段: username(明文,删除时匿名化)、password_hash(argon2id)、last_login_at。系统不收集 email/电话/地址（数据最小化）。

## 2. 数据保护

| 措施 | L4                | L3                | L2       |
| ---- | ----------------- | ----------------- | -------- |
| 传输 | TLS 强制          | TLS 强制          | TLS 推荐 |
| 存储 | 加密(哈希/Secret) | RLS+RBAC+审计     | RLS+RBAC |
| 销毁 | 硬删除            | 软删除 30d→硬删除 | 用户可删 |

数据生命周期: 用户账户活跃期保留,删除时 anonymizeUser(保留引用)或 deleteUser(硬删除); Refresh Token TTL 7d; 审计日志 180d; 备份保留 7 份。

GDPR 映射: 被遗忘权(anonymizeUser/deleteUser)、数据最小化(仅 username+hash)、访问可追溯(HMAC 审计)、凭证保护(argon2id+TLS+脱敏)。

## 3. 加密策略

| 层级     | 对象       | 算法                    | 密钥管理       |
| -------- | ---------- | ----------------------- | -------------- |
| 传输     | 网络通信   | TLS 1.2/1.3             | Let's Encrypt  |
| 密码     | 用户密码   | bcrypt(cost=12)         | 内置盐         |
| API Key  | 组织密钥   | argon2id + SHA-256 索引 | K8s Secret     |
| 审计日志 | HMAC 签名  | HMAC-SHA256             | AUDIT_HMAC_KEY |
| JWT      | Token 签名 | RS256(生产)/HS256(开发) | K8s Secret     |
| 备份     | WAL-G      | Brotli + 可选 KMS       | WALG_ENVELOP   |

密钥轮换: JWT 90 天(新密钥签名→等 TTL 过期→移旧公钥); 审计 HMAC 180 天(新日志新密钥,旧密钥验证历史)。

TLS: 最低 1.2(禁用 SSLv3/1.0/1.1),推荐 1.3; 仅 AES-GCM + ChaCha20-Poly1305。

## 4. RBAC 角色与权限

| 角色     | 权限                              |
| -------- | --------------------------------- |
| ADMIN    | 全部管理(用户/组织/系统配置/审计) |
| ANALYST  | 回测/分析/组合管理/数据查看       |
| READONLY | 只读查看                          |

七项权限独立分配: BACKTEST_ACCESS / ANALYSIS_ACCESS / PORTFOLIO_MANAGE / DATA_MANAGE / ADMIN_ACCESS / KEY_MANAGE / BILLING_MANAGE。

多租户隔离: 共享 schema + tenant_id + Postgres RLS。withTenant(tenantId, fn) 事务内 SET LOCAL app.current_tenant_id。市场数据表不启用 RLS（全局共享）。

## 5. 认证机制

- JWT（jose, RS256）: Access Token 15min, Refresh Token 7d + 轮换, Redis 存储
- x-api-key 兼容: 命中注入 analyst 角色, 按 org 收敛
- MFA/TOTP: 管理员强制
- Idempotency-Key 中间件: Redis 存储
- Break-Glass: ADMIN_API_KEY 仅平台 break-glass,不可吊销,须严格保管

## 6. 会话与密码策略

- 会话超时: Access Token 15min, Refresh Token 7d, 空闲超时 30min, 绝对超时 24h
- 并发会话: 同用户最多 5 个活跃 Refresh Token
- 密码: 12 位+四类字符, 90 天轮换, 历史 5 次不重复, bcrypt 存储
- 5 次失败锁定 15min, IP 10 次/小时封锁 1h

## 7. 备份与恢复

| 组件       | 方案                      | RPO    | 保留     |
| ---------- | ------------------------- | ------ | -------- |
| PostgreSQL | WAL-G 每日全量+实时 WAL   | < 2min | 7 份全量 |
| Redis      | RDB 快照(非持久化数据)    | 不保证 | —        |
| 配置/密钥  | K8s Secret + Git 版本控制 | —      | Git 历史 |

RTO 目标: PG < 30min, 引擎 < 5min, 全量恢复 < 4h。

恢复操作: ash scripts/backup-restore.sh LATEST(全量恢复); PITR:
ecovery_target_time 指定时间点; 验证: pg_verifybackup + WAL 完整性。

## 8. 等保对照

| 条款    | 要求                       | 状态 |
| ------- | -------------------------- | ---- |
| 8.1.3.1 | 访问控制(RBAC+RLS)         | OK   |
| 8.1.4.1 | 身份鉴别(JWT+MFA+密码策略) | OK   |
| 8.1.4.2 | 数据保密性(分级+加密+TLS)  | OK   |
| 8.1.4   | 数据备份与恢复(WAL-G+PITR) | OK   |
