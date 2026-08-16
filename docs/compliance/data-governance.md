# 数据治理（等保三级 8.1.3.1 + 8.1.4.1/4.2 + 8.1.4 数据备份）

## 1. 数据分级与保护

| 级别          | 定义              | 示例                            | 保护                   |
| ------------- | ----------------- | ------------------------------- | ---------------------- |
| L4 极高       | 严重法律/财务损失 | 密码哈希、JWT 密钥、API Key     | 加密存储+审计+最小知悉 |
| L3 高         | 商业损失/隐私违规 | 用户信息、组织财务、回测策略    | RLS+审计+TLS           |
| L2 中 / L1 低 | 有限影响 / 公开   | 回测结果、组合配置 / 行情、指数 | RLS+TLS / 无特殊       |

PII 字段: username(明文,删除时匿名化)、email(注册/邮箱验证/组织邀请)、password_hash(argon2id)、last_login_at。不收集电话/地址（数据最小化）。

生命周期: 用户活跃期保留；删除时 anonymizeUser(保留引用；硬删除已退役，见 ADR-016)；Refresh Token TTL 7d；审计日志 180d；备份 7 份。
GDPR: 被遗忘权(anonymize)、最小化(username+email+hash)、可追溯(HMAC 审计)、凭证保护(argon2id+TLS)。

## 2. 加密策略

| 层级           | 对象                | 算法                                  | 密钥管理                    |
| -------------- | ------------------- | ------------------------------------- | --------------------------- |
| 传输           | 网络通信            | TLS 1.2/1.3                           | Let's Encrypt               |
| 密码 / API Key | 用户密码 / 组织密钥 | argon2id + SHA-256 索引               | 内置盐 / K8s Secret         |
| 审计 / JWT     | HMAC 签名 / Token   | HMAC-SHA256 / RS256(生产) HS256(开发) | AUDIT_HMAC_KEY / K8s Secret |
| 备份           | WAL-G               | Brotli + 可选 KMS                     | WALG_ENVELOP                |

轮换: JWT 90 天（新钥签名→等 TTL→移旧公钥）；审计 HMAC 180 天（新日志新钥, 旧钥验历史）。TLS 最低 1.2, 推荐 1.3；仅 AES-GCM + ChaCha20-Poly1305。

## 3. RBAC 与多租户

角色与权限定义、多租户 RLS 隔离实现见 ADR-007/ADR-009（共享 schema + tenant_id + withTenant 事务内 SET LOCAL；市场数据表不启用 RLS 全局共享）。

## 4. 认证与会话

JWT / x-api-key / Idempotency-Key / break-glass 模型见 ADR-007。
会话: Access 15min / Refresh 7d / 空闲超时（readonly 30min、analyst 1h）；绝对 24h 与活跃 Refresh Token 数量上限尚未实施。MFA/TOTP 未实施（users.mfa_secret/mfa_backup_codes 列为遗留死列，见 ADR-013）。
密码: 至少 12 位（无字符类/轮换/历史约束）；锁定: 5 次失败锁 15min, IP 10 次/5min 封 1h（ANOMALY_LOGIN_* 可配）。

## 5. 备份与恢复

方案与 RTO/RPO 目标：WAL-G 每日全量+实时 WAL 保留 7 份、Redis RDB、K8s Secret；恢复流程：`bash scripts/backup-restore.sh LATEST`、PITR 用 recovery_target_time、pg_verifybackup + WAL 完整性验证。（当前仅 docker-compose 落地 wal-g+ofelia 每日备份与 7 份保留；k8s 生产未落地 PITR，见 k8s/postgres.yaml。）

## 6. 等保对照

| 条款              | 要求                                                           | 状态 |
| ----------------- | -------------------------------------------------------------- | ---- |
| 8.1.3.1           | 访问控制(RBAC+RLS)                                             | OK   |
| 8.1.4.1 / 8.1.4.2 | 身份鉴别(JWT+密码策略；MFA 未实施) / 数据保密性(分级+加密+TLS) | 部分 |
| 8.1.4             | 数据备份与恢复(WAL-G+PITR)                                     | OK   |
