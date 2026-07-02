# ADR-033: 按组织的 API 密钥（哈希存储 + 可吊销，取代单一 ADMIN_API_KEY）

> **企业理由**：单一静态 `ADMIN_API_KEY` 既是身份又是权限，泄露后无法吊销、无法归因到具体租户/用途，且其"analyst 还是 admin"的双重语义自相矛盾。多租户 SaaS 需要每个组织自助管理可吊销、可审计的密钥，密钥泄露的爆炸半径收敛到单个组织。

| 字段   | 值                                         |
| ------ | ------------------------------------------ |
| 状态   | 已接受                                     |
| 日期   | 2026-06-25                                 |
| 决策者 | 架构组                                     |
| 范围   | 鉴权、多租户                               |
| 关联   | ADR-017（认证授权）、ADR-032（多租户 RLS） |

## Context（背景和驱动力）

1. 旧 `x-api-key` 路径硬编码到单一 `ADMIN_API_KEY`，无法按组织区分、无法吊销、无法审计最后使用时间。
2. 多租户下密钥应归属组织（租户），权限随组织内角色，泄露后可单独吊销而不影响他人。
3. 密钥明文绝不能落库——一旦数据库泄露即等于全部密钥泄露。

## Decision（决策内容）

- 复用 `api_keys` 表（ADR-032，迁移 `009_tenancy.sql`）：`id, org_id, name, key_hash, key_prefix, last_used_at, revoked_at`。
- 新增 `api/services/apiKeyService.ts`：
  - `createApiKey(orgId, name, createdBy)` 生成 `bpk_live_<rand>`，仅存 SHA-256 `key_hash` 与可展示前缀 `key_prefix`，**明文仅在创建响应里返回一次**。
  - `verifyApiKey(plaintext)` 按哈希查未吊销密钥，命中后异步更新 `last_used_at`。
  - `listApiKeys(orgId)` / `revokeApiKey(orgId, id)` 均以 `org_id` 收敛，防跨租户。
- `api/middleware/jwtAuth.ts` 的 `x-api-key` 路径改为 DB 查询：命中则注入 `req.user = { sub: 'apikey:'+keyId, role: 'analyst', tenant_id: orgId, org_role: 'analyst' }`。
- `ADMIN_API_KEY` 仅保留为可选的、文档化的**平台 break-glass 密钥**，命中时授予 `platform_admin: true`，与按组织密钥的语义彻底分离。
- 新增 `/api/v1/keys` CRUD 路由（`jwtAuth + resolveTenant + requireTenant + requirePermission(ADMIN_ACCESS)`）。

## Consequences（后果）

### 正面

- 密钥可按组织自助创建/吊销/审计，泄露爆炸半径收敛到单组织。
- 仅存哈希 + 前缀，数据库泄露不直接暴露可用密钥。
- `platform_admin` 与租户密钥语义清晰分离，消除双重角色矛盾。

### 负面

- 校验需一次 DB 查询（已对哈希列建唯一索引，开销可忽略；可后续加缓存）。
- break-glass `ADMIN_API_KEY` 仍是高权限静态凭证，须严格保管并尽量少用。
