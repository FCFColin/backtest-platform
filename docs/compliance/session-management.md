# 会话管理规范（等保三级 8.1.4.1 身份鉴别）

> **文档编号**: COMPLIANCE-SM-001  
> **等保条款**: GB/T 22239-2019 三级 — 8.1.4.1 身份鉴别（空闲超时）  
> **最近更新**: 2026-07-25  
> **关联任务**: P0-04 / P3-01 T1

---

## 1. 会话生命周期

### 1.1 Token 体系

| Token 类型         | TTL             | 用途              | 存储                            |
| ------------------ | --------------- | ----------------- | ------------------------------- |
| Access Token (JWT) | 15 分钟         | API 请求鉴权      | 客户端内存（不存 localStorage） |
| Refresh Token      | 7 天            | 轮换 Access Token | Redis（带 family ID 防重放）    |
| Session ID         | 随 Access Token | 服务端会话状态    | Redis                           |

### 1.2 空闲超时

- **Access Token 过期**: 15 分钟无操作后 token 失效，客户端须用 Refresh Token 获取新 Access Token
- **Refresh Token 空闲超时**: 7 天未活跃后 Refresh Token 失效，用户须重新登录
- **等保要求**: 三级要求会话空闲超时 ≤ 30 分钟 → Access Token 15 分钟 **满足**

### 1.3 绝对超时

- Refresh Token 最长生命周期 7 天，超过后强制重新认证
- 管理员会话：Refresh Token TTL 缩短为 1 天

---

## 2. Token 轮换策略

### 2.1 Refresh Token 轮换

每次使用 Refresh Token 获取新 Access Token 时：

1. 生成新的 Refresh Token（新 family member）
2. 旧 Refresh Token 加入 Redis 黑名单（TTL = 原 token 剩余有效期）
3. Family ID 保持不变，用于检测 token 被盗用（同一 family 两个 token 同时使用 → 封禁整个 family）

### 2.2 Token 吊销

| 场景           | 机制                               |
| -------------- | ---------------------------------- |
| 用户登出       | Refresh Token 加入 Redis 黑名单    |
| 管理员强制踢出 | 清除用户所有 Refresh Token family  |
| 密码修改       | 封禁所有活跃 family，强制重新登录  |
| 安全事件       | 批量封禁（`FLUSHDB` 特定 pattern） |

---

## 3. 并发会话控制

- 同一用户最大并发会话数：5（防账户共享）
- 超过限制时最早的会话自动失效
- 管理员可配置组织级别并发限制

---

## 4. 等保三级对照

| 等保条款   | 要求           | 实现                               | 状态 |
| ---------- | -------------- | ---------------------------------- | ---- |
| 8.1.4.1 d) | 空闲超时       | Access Token 15 分钟 TTL           | ✅   |
| 8.1.4.1 a) | 身份标识唯一性 | JWT + userId 唯一标识              | ✅   |
| 8.1.4.2 e) | 会话终止       | 登出 + Redis 黑名单 + 密码修改封禁 | ✅   |
