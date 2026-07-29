# 安全开发规范（等保三级 8.1.5.2 安全开发）

> **文档编号**: COMPLIANCE-SD-001  
> **等保条款**: GB/T 22239-2019 三级 — 8.1.5.2 安全开发  
> **最近更新**: 2026-07-25  
> **关联任务**: P3-01 T1

---

## 1. 安全开发生命周期（SDL）

### 1.1 开发阶段安全要求

| 阶段     | 安全要求                              | 验证方式                        |
| -------- | ------------------------------------- | ------------------------------- |
| **需求** | 安全需求分析（威胁建模）              | PR 描述包含安全考量             |
| **设计** | 安全设计审查（RBAC/RLS/加密）         | 架构 ADR 审查                   |
| **编码** | 安全编码规范 + ESLint + golangci-lint | CI 自动检查                     |
| **测试** | 单元/集成/安全测试                    | CI test:unit + test:integration |
| **部署** | CI/CD 流水线 + 镜像扫描               | CI security-scan + Trivy        |
| **运维** | 监控 + 审计 + 漏洞响应                | Prometheus + 审计日志           |

---

## 2. 安全编码规范

### 2.1 TypeScript (Backend/Frontend)

| 规则         | 实现                                           | 工具                   |
| ------------ | ---------------------------------------------- | ---------------------- |
| 输入验证     | Zod schema 验证所有 API 输入                   | `schemas/` 目录        |
| SQL 注入防护 | 参数化查询，禁止字符串拼接                     | ESLint 规则            |
| XSS 防护     | React 自动转义，禁止 `dangerouslySetInnerHTML` | ESLint react/no-danger |
| 敏感数据     | 禁止日志输出密码/token                         | ESLint 自定义规则      |
| 密钥管理     | 禁止硬编码密钥                                 | gitleaks CI 扫描       |
| 依赖管理     | pnpm lockfile + pnpm audit                      | CI security-scan       |

### 2.2 Go (Engine/Data-fetcher)

| 规则         | 实现                       | 工具             |
| ------------ | -------------------------- | ---------------- |
| 输入验证     | gin binding + 自定义验证   | golangci-lint    |
| SQL 注入防护 | pgx 参数化查询             | gosec            |
| 并发安全     | `-race` 检测               | CI go test -race |
| 错误处理     | 不泄露内部错误信息给客户端 | errcheck         |
| 依赖管理     | go.sum + govulncheck       | CI security-scan |

---

## 3. 代码审查安全检查清单

PR 审查时须确认：

- [ ] 输入验证（Zod schema / Go binding）
- [ ] 认证/授权（JWT + RBAC 检查）
- [ ] SQL 查询参数化（无字符串拼接）
- [ ] 无硬编码密钥/密码
- [ ] 无敏感信息日志输出
- [ ] 错误处理不泄露内部信息
- [ ] 新依赖通过 pnpm audit / govulncheck
- [ ] 数据库迁移可回滚（down 脚本）
- [ ] 审计日志覆盖写操作

---

## 4. CI/CD 安全门禁

| CI Job               | 安全检查                             | 阻断级别               |
| -------------------- | ------------------------------------ | ---------------------- |
| `security-scan`      | pnpm audit (high) + govulncheck       | **阻断**               |
| `gitleaks`           | 密钥泄露扫描                         | **阻断**               |
| `node-quick`         | TypeScript 类型检查 + ESLint         | **阻断**               |
| `go` / `go-engine`   | go vet + golangci-lint + govulncheck | **阻断**               |
| `docker`             | Trivy 镜像扫描 (HIGH/CRITICAL)       | 非阻断（nightly 跟进） |
| `migration-rollback` | 迁移可回滚验证                       | **阻断**               |

---

## 5. 等保三级对照

| 等保条款   | 要求         | 实现                            | 状态 |
| ---------- | ------------ | ------------------------------- | ---- |
| 8.1.5.2 a) | 安全开发规范 | SDL + 编码规范 + CI 门禁        | ✅   |
| 8.1.5.2 b) | 代码安全审查 | PR review + CI 自动检查         | ✅   |
| 8.1.5.2 c) | 安全测试     | 单元/集成/混沌/E2E 测试         | ✅   |
| 8.1.5.2 d) | 漏洞管理     | pnpm audit + govulncheck + Trivy | ✅   |
