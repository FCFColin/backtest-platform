# Break-Glass 操作规程（等保三级 8.1.4.1 身份鉴别）

> **文档编号**: COMPLIANCE-BG-001  
> **等保条款**: GB/T 22239-2019 三级 — 8.1.4.1 身份鉴别 / 8.1.4.2 访问控制  
> **最近更新**: 2026-07-25  
> **关联任务**: P0-04 / P3-01 T1

---

> **完整文档**: 详见 `docs/security/break-glass-procedure.md`

本文档为等保测评目录索引。Break-glass 平台密钥操作规程的完整内容位于 `docs/security/break-glass-procedure.md`，涵盖：

- 平台 break-glass 密钥的生命周期（创建/轮换/吊销）
- 使用触发条件与双签原则
- 审计监控（陈旧密钥告警、越权检测）
- 故障处置（所有密钥吊销、Redis/DB 不可用场景）

---

## 等保三级对照

| 控制点   | 措施                                          | 状态 |
| -------- | --------------------------------------------- | ---- |
| 身份鉴别 | argon2id 哈希存储、90 天限期、可轮换          | ✅   |
| 访问控制 | `requirePlatformAdmin` 最小权限、可一键吊销   | ✅   |
| 安全审计 | auditLog + last_used_at + Prometheus 陈旧监控 | ✅   |
| 入侵防范 | gitleaks 扫描、陈旧密钥告警、Redis 吊销缓存   | ✅   |
