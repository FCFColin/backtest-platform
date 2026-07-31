# 数据治理（等保三级 8.1.3.1 + 8.1.4.1/4.2 + 8.1.4 数据备份）

> 合并自: data-protection + identity-and-access + backup-restore

## 1. 数据分级与保护

| 级别          | 定义              | 示例                            | 保护                   |
| ------------- | ----------------- | ------------------------------- | ---------------------- |
| L4 极高       | 严重法律/财务损失 | 密码哈希、JWT 密钥、API Key     | 加密存储+审计+最小知悉 |
| L3 高         | 商业损失/隐私违规 | 用户信息、组织财务、回测策略    | RLS+审计+TLS           |
| L2 中 / L1 低 | 有限影响 / 公开   | 回测结果、组合配置 / 行情、指数 | RLS+TLS / 无特殊       |

PII 字段: username(明文,删除时匿名化)、password_hash(argon2id)、last_login_at。不收集 email/电话/地址（数据最小化）。

生命周期: 用户活跃期保留；删除时 anonymizeUser(保留引用)或 deleteUser(硬删除)；Refresh Token TTL 7d；审计日志 180d；备份 7 份。
GDPR: 被遗忘权(anonymize/delete)、最小化(仅 username+hash)、可追溯(HMAC 审计)、凭证保护(argon2id+TLS)。

## 2. 加密策略

| 层级           | 对象                | 算法                                      | 密钥管理                    |
| -------------- | ------------------- | ----------------------------------------- | --------------------------- |
| 传输           | 网络通信            | TLS 1.2/1.3                               | Let's Encrypt               |
| 密码 / API Key | 用户密码 / 组织密钥 | bcrypt(cost=12) / argon2id + SHA-256 索引 | 内置盐 / K8s Secret         |
| 审计 / JWT     | HMAC 签名 / Token   | HMAC-SHA256 / RS256(生产) HS256(开发)     | AUDIT_HMAC_KEY / K8s Secret |
| 备份           | WAL-G               | Brotli + 可选 KMS                         | WALG_ENVELOP                |

轮换: JWT 90 天（新钥签名→等 TTL→移旧公钥）；审计 HMAC 180 天（新日志新钥, 旧钥验历史）。TLS 最低 1.2, 推荐 1.3；仅 AES-GCM + ChaCha20-Poly1305。

## 3. RBAC 与多租户

角色: ADMIN（全部管理）/ ANALYST（回测·分析·组合·数据）/ READONLY（只读）。七权限: BACKTEST/ANALYSIS/PORTFOLIO_MANAGE/DATA_MANAGE/ADMIN/KEY_MANAGE/BILLING_MANAGE。

多租户: 共享 schema + tenant_id + RLS；withTenant(tenantId, fn) 事务内 SET LOCAL app.current_tenant_id；市场数据表不启用 RLS（全局共享）。

## 4. 认证与会话

JWT(jose RS256): Access 15min, Refresh 7d + 轮换（Redis）；x-api-key → analyst 角色（按 org 收敛）；MFA/TOTP 管理员强制；Idempotency-Key 中间件；ADMIN_API_KEY 仅 break-glass。

会话: Access 15min / Refresh 7d / 空闲 30min / 绝对 24h；同用户最多 5 个活跃 Refresh Token。
密码: 12 位+四类字符, 90 天轮换, 历史 5 次不重复；5 次失败锁 15min, IP 10 次/h 封 1h。

## 5. 备份与恢复

| 组件       | 方案                      | RPO    | 保留     |
| ---------- | ------------------------- | ------ | -------- |
| PostgreSQL | WAL-G 每日全量+实时 WAL   | < 2min | 7 份全量 |
| Redis      | RDB 快照(非持久化数据)    | 不保证 | —        |
| 配置/密钥  | K8s Secret + Git 版本控制 | —      | Git 历史 |

RTO: PG < 30min, 引擎 < 5min, 全量恢复 < 4h。恢复: `bash scripts/backup-restore.sh LATEST`；PITR 用 recovery_target_time；验证 pg_verifybackup + WAL 完整性。

## 6. 等保对照

| 条款              | 要求                                                   | 状态 |
| ----------------- | ------------------------------------------------------ | ---- |
| 8.1.3.1           | 访问控制(RBAC+RLS)                                     | OK   |
| 8.1.4.1 / 8.1.4.2 | 身份鉴别(JWT+MFA+密码策略) / 数据保密性(分级+加密+TLS) | OK   |
| 8.1.4             | 数据备份与恢复(WAL-G+PITR)                             | OK   |
