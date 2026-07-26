# 平台 Break-Glass 密钥操作规程（P0-04 / 等保三级合规）

> **适用范围**：运营 SaaS 自身的平台级 break-glass 凭证（`api_keys` 表中 `is_platform_admin=true, org_id=NULL` 的记录）。
> **不适用**：按组织签发的租户 API Key（由各组织管理员通过 `/api/v1/keys` 自助管理，见 ADR-033）。
> **相关 ADR**：ADR-033（按组织 API Key）、ADR-017（JWT + RBAC）、ADR-045（Redis HA）。
> **相关计划项**：tmp2.md P0-04。

---

## 1. 背景与合规要求

等保 2.0 三级"身份鉴别"（GB/T 22239-2019 §8.1.4.1）要求身份标识唯一性、鉴别信息复杂度与生命周期管理；"访问控制"（§8.1.4.2）要求最小权限与可吊销能力。单一不可吊销的静态 `ADMIN_API_KEY` 环境变量违背这两条。

P0-04 将平台 break-glass 凭证从环境变量迁入 `api_keys` 表，统一受以下生命周期约束：

| 维度     | 约束                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| 存储     | `key_hash_argon2`（argon2id 编码哈希，与密码同策略）+ `key_hash`（sha256 查找索引）      |
| 有效期   | `expires_at` 最长 90 天（DB CHECK 约束 `api_keys_expires_max_90d` 强制）                 |
| 吊销     | `revoked_at` 软删除 + Redis 吊销缓存 `apikey:revoked:{keyId}`（跨 Pod 立即生效）         |
| 审计     | `last_used_at` 异步更新 + auditLog 中间件记录每次使用                                    |
| 陈旧监控 | 超过 7 天未使用触发 Prometheus gauge `api_keys_stale_count{is_platform_admin=true}` 告警 |

---

## 2. 谁可以使用 Break-Glass 密钥

- **授权角色**：平台运维负责人（SRE / Platform Owner）。1 人团队下即仓库 owner。
- **禁止**：租户管理员（`org_id` 非 NULL 的 ADMIN 角色）不可触碰平台密钥——`requirePlatformAdmin` 中间件强制 `platform_admin=true`，租户内 admin 即便有 `ADMIN_ACCESS` 也被拒绝（防被攻陷的租户管理员禁用运维应急通道）。
- **双签原则**：break-glass 密钥的使用、轮换、吊销应在事件工单（Issue / 事件单）中留下记录，由另一人复核（1 人团队下事后补记至事件复盘文档）。

---

## 3. 何时使用（触发条件）

仅当常规 JWT 登录路径不可用时方可启用 break-glass，典型场景：

1. **数据库主库故障**导致用户登录（`/api/v1/auth/login`）失败，需通过 API Key 鉴权访问运维端点。
2. **Redis 故障**导致 JWT 验证链失效（ADR-045 下 Redis 不可用即 503），需通过 `x-api-key` 鉴权路径访问。
3. **应急数据修复**：需直接调用 `DELETE /api/v1/admin/keys/:id` 吊销疑似泄露的平台密钥。
4. **等保测评演示**：向测评人员演示 break-glass 凭证的可审计、可吊销能力。

**严禁**用于日常业务调用（回测、数据查询）——break-glass 应为应急偶发使用，陈旧监控阈值（7 天）即为此设计。

---

## 4. 为何使用（目的声明）

每次启用 break-glass 须在事件工单中记录：

- **触发事件**：上述第 3 节中的具体场景编号 + 简述。
- **目标操作**：将要执行的 API 调用（如 `POST /api/v1/admin/keys/rotate`）。
- **预计时长**：使用窗口（应在事件解决后立即吊销或轮换）。

---

## 5. 密钥生命周期操作

### 5.1 首次部署 / Bootstrap 迁移

启动时若 DB 中尚无有效平台密钥且环境变量 `ADMIN_API_KEY` 存在，`bootstrapPlatformAdminKey()` 会一次性将其迁移为 DB 记录（90 天有效期），并输出警告：

```
[bootstrap] 已将环境变量 ADMIN_API_KEY 迁移为 DB 平台 break-glass 密钥（90 天有效）。
请尽快删除环境变量引用，并通过 /api/v1/admin/keys/rotate 轮换为新随机密钥
```

**迁移后必做**：

1. 从 K8s Secret / `.env` 中删除 `ADMIN_API_KEY` 环境变量引用（gitleaks 会扫描 `ADMIN_API_KEY=` 模式，防止遗留）。
2. 调用 `POST /api/v1/admin/keys/rotate` 将 bootstrap 迁移的旧值轮换为新随机密钥（旧值可能已存在于历史环境变量中，属泄露风险）。
3. 在事件工单中记录"首次 bootstrap 迁移完成"。

### 5.2 轮换（Rotation）

```
POST /api/v1/admin/keys/rotate
Headers: x-api-key: <当前平台密钥明文>
Body: { "name": "<可读名称，如 incident-2026-07-24>", "expiresInDays": 90 }  // 均可选
```

行为：

- 旧密钥（当前用于鉴权的 keyId）立即置 `revoked_at=NOW()` + 写入 Redis 吊销缓存（跨 Pod 立即失效）。
- 新密钥为 `bpk_live_<32字节随机>` 的高熵随机值，argon2id 哈希存储，有效期 90 天（上限由 `PLATFORM_ADMIN_KEY_MAX_TTL_DAYS` 强制）。
- **明文仅此响应一次性返回**，服务端不再可见——务必立即妥善保存（密码管理器 / GSM）。

**定期轮换**：建议每 80 天轮换一次（留 10 天缓冲），不等到 90 天到期。

### 5.3 吊销（Revocation）

```
DELETE /api/v1/admin/keys/:id
Headers: x-api-key: <仍有效的平台密钥明文>
```

行为：

- 指定 keyId 置 `revoked_at=NOW()` + Redis 吊销缓存立即写入。
- 下一请求即被 `verifyApiKey` 拒绝（Redis 缓存命中或 DB `revoked_at IS NULL` 过滤）。

**一键吊销场景**：疑似泄露、人员离岗、等保测评要求即时吊销。

### 5.4 列表（审计查询）

```
GET /api/v1/admin/keys
Headers: x-api-key: <有效的平台密钥明文>
```

返回全部平台密钥（含已吊销），用于审计：`id / name / keyPrefix / createdAt / lastUsedAt / revokedAt / expiresAt`。**不返回明文或哈希**。

---

## 6. 审计与监控

| 数据源                                                        | 用途                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `audit` 日志（Outbox）                                        | 每次 `x-api-key` 鉴权请求经 `auditLog` 中间件记录（method/path/IP/状态码 + HMAC 签名） |
| `api_keys.last_used_at`                                       | 异步更新，用于陈旧度判定                                                               |
| Prometheus `api_keys_stale_count{is_platform_admin="true"}`   | 超 7 天未使用即 >0，触发告警                                                           |
| Prometheus `auth_failures_total{reason="not_platform_admin"}` | 租户 admin 误用平台密钥管理端点计数                                                    |

**告警阈值**：

- 平台密钥陈旧计数 > 0 且持续 > 1 小时：P1 告警（可能 break-glass 失控或应急后未轮换）。
- 平台密钥距 `expires_at` < 7 天：P1 告警（即将过期，需轮换）。
- `not_platform_admin` 拒绝计数 > 0：P2 告警（可能有越权尝试）。

---

## 7. 故障处置

### 7.1 所有平台密钥均已吊销 / 过期

此时无任何有效平台密钥可调用 `/rotate`。处置：

1. 临时设置环境变量 `ADMIN_API_KEY=<新随机值>` 重启一个 API Pod。
2. `bootstrapPlatformAdminKey()` 检测到 DB 无有效平台密钥 + 环境变量存在 → 迁移为 DB 记录。
3. 立即 `POST /api/v1/admin/keys/rotate` 轮换为 DB 内随机密钥。
4. 删除环境变量，重启 Pod，验证仅 DB 密钥生效。

### 7.2 Redis 不可用期间

ADR-045 下 `requireRedis` 抛 `RedisUnavailableError` → 路由层 503。但 `verifyApiKey` 对 Redis 吊销缓存查询做了优雅降级：Redis 不可用时仅依赖 DB `revoked_at` 校验并记录 warning，**不阻断鉴权热路径**。因此 break-glass 在 Redis 故障期间仍可用，仅跨 Pod 吊销即时性降级为 DB 复制延迟。

### 7.3 数据库不可用

DB 不可用时 `verifyApiKey` 无法查询密钥记录 → 鉴权失败。此时 break-glass 亦不可用，须先恢复 DB（PostgreSQL Streaming Replication / 备份恢复，见 P1-03 / P1-09）。

---

## 8. 等保三级对照

| 等保控制点           | 本规程对应措施                                                    |
| -------------------- | ----------------------------------------------------------------- |
| 身份鉴别（§8.1.4.1） | 唯一 keyId、argon2id 存储、90 天限期、可轮换                      |
| 访问控制（§8.1.4.2） | `requirePlatformAdmin` 最小权限、可一键吊销、租户隔离             |
| 安全审计（§8.1.4.3） | auditLog + last_used_at + Prometheus 陈旧监控                     |
| 入侵防范（§8.1.4.4） | gitleaks 扫描 `ADMIN_API_KEY=` 模式、陈旧密钥告警、Redis 吊销缓存 |

---

## 9. 变更记录

| 日期       | 变更                 | 负责人   |
| ---------- | -------------------- | -------- |
| 2026-07-24 | 初始版本（P0-04 T7） | 平台运维 |
