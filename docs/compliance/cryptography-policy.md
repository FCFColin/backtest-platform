# 密码学加密策略（等保三级 8.1.4.2 数据保密性）

> **文档编号**: COMPLIANCE-CR-001  
> **等保条款**: GB/T 22239-2019 三级 — 8.1.4.2 数据保密性  
> **最近更新**: 2026-07-25  
> **关联任务**: P3-01 T1/T4

---

## 1. 加密策略总览

### 1.1 加密层级

| 层级                  | 加密对象          | 算法                         | 密钥管理                   |
| --------------------- | ----------------- | ---------------------------- | -------------------------- |
| **传输层**            | 网络通信          | TLS 1.2/1.3（AES-256-GCM）   | Let's Encrypt / 内部 CA    |
| **存储层 — 密码**     | 用户密码          | bcrypt（cost=12）            | 内置盐值                   |
| **存储层 — API Key**  | 平台/组织 API Key | argon2id + SHA-256 索引      | K8s Secret                 |
| **存储层 — 审计日志** | HMAC 签名         | HMAC-SHA256                  | `AUDIT_HMAC_KEY`（Secret） |
| **存储层 — JWT**      | Token 签名        | RS256（生产）/ HS256（开发） | K8s Secret                 |
| **备份层**            | WAL-G 备份        | Brotli 压缩 + 可选 KMS 加密  | `WALG_ENVELOP`             |

### 1.2 密钥清单

| 密钥                      | 用途                    | 轮换周期 | 存储              |
| ------------------------- | ----------------------- | -------- | ----------------- |
| `JWT_PRIVATE_KEY`         | JWT RS256 签名          | 90 天    | K8s Secret        |
| `JWT_PUBLIC_KEY`          | JWT RS256 验证          | 跟随私钥 | ConfigMap（公开） |
| `AUDIT_HMAC_KEY`          | 审计日志 HMAC 签名      | 180 天   | K8s Secret        |
| `ENGINE_AUTH_TOKEN`       | engine-go 服务间认证    | 按需     | K8s Secret        |
| `DATA_SERVICE_AUTH_TOKEN` | data-fetcher 服务间认证 | 按需     | K8s Secret        |
| `UNLEASH_API_TOKEN`       | Unleash SDK 鉴权        | 按需     | K8s Secret        |
| `STRIPE_SECRET_KEY`       | Stripe 支付 API         | 按需     | K8s Secret        |

---

## 2. 敏感字段加密决策（P3-01 T4）

### 2.1 已加密字段

| 字段              | 表         | 加密方式          | 理由               |
| ----------------- | ---------- | ----------------- | ------------------ |
| `password_hash`   | `users`    | bcrypt（cost=12） | 等保要求 + 不可逆  |
| `key_hash_argon2` | `api_keys` | argon2id          | 等保要求 + 不可逆  |
| `key_hash`        | `api_keys` | SHA-256           | 查找索引（不可逆） |

### 2.2 未加密字段决策

| 字段              | 表              | 决策         | 理由                                                                                                   |
| ----------------- | --------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `email`           | `users`         | **明文存储** | 需要查询（登录/通知）；RLS 隔离 + TLS 传输 + 访问审计提供保护。GDPR 允许在合法利益基础上明文存储邮箱。 |
| `org_name`        | `organizations` | **明文存储** | 业务展示需要；非敏感信息                                                                               |
| `phone`           | `users`         | **明文存储** | 可选字段；RLS + TLS 保护                                                                               |
| `billing_address` | `billing`       | **明文存储** | Stripe 管理主要支付信息，本地仅存摘要                                                                  |

### 2.3 备选方案（如测评要求加密邮箱）

如等保测评明确要求邮箱字段加密：

- 使用 PostgreSQL `pgcrypto` 扩展
- 确定性加密（`pgp_sym_encrypt` + 固定 IV）以支持等值查询
- 密钥存储在 KMS / K8s Secret
- 性能影响：约 5-10% 查询开销

---

## 3. TLS 版本限制（P3-01 T5）

### 3.1 策略

- **最低版本**: TLS 1.2（禁用 SSLv3/TLS 1.0/TLS 1.1）
- **推荐版本**: TLS 1.3
- **密码套件**: 仅 AES-GCM 和 ChaCha20-Poly1305

### 3.2 各组件配置

| 组件             | 配置                                   | 位置              |
| ---------------- | -------------------------------------- | ----------------- |
| APISIX           | `ssl_protocols TLSv1.2 TLSv1.3;`       | `config.yaml`     |
| Nginx (frontend) | `ssl_protocols TLSv1.2 TLSv1.3;`       | `nginx.conf`      |
| PostgreSQL       | `ssl_min_protocol_version = 'TLSv1.2'` | `postgresql.conf` |
| Redis            | `tls-protocols "TLSv1.2 TLSv1.3"`      | `redis.conf`      |

---

## 4. 密钥轮换流程

### 4.1 JWT 密钥轮换

1. 生成新 RSA 密钥对
2. 将新公钥添加到 JWKS（旧公钥保留，用于验证存量 token）
3. 将新私钥部署到 API（开始用新密钥签名）
4. 等待 Access Token TTL（15 分钟）后，所有旧 token 过期
5. 移除旧公钥

### 4.2 审计 HMAC 密钥轮换

1. 生成新 HMAC 密钥
2. 新日志使用新密钥签名，旧密钥保留用于验证历史日志
3. 180 天后（审计日志保留期）移除旧密钥

---

## 5. 等保三级对照

| 等保条款   | 要求         | 实现                     | 状态 |
| ---------- | ------------ | ------------------------ | ---- |
| 8.1.4.2 a) | 数据传输保密 | TLS 1.2+（全链路）       | ✅   |
| 8.1.4.2 b) | 数据存储保密 | bcrypt + argon2id + HMAC | ✅   |
| 8.1.4.2 c) | 密钥管理     | K8s Secret + 定期轮换    | ✅   |
| 8.1.4.2 d) | 剩余信息保护 | 账户删除后数据清除       | ✅   |
