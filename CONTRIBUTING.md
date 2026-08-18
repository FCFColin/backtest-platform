# 贡献指南

前置要求与常用命令见 `README.md`（快速启动）与 `AGENTS.md`（权威源为 package.json scripts 与 `.env.example`）。IDE 推荐 VS Code 或 WebStorm / GoLand。

## PR 提交规范

**标题**：与 Commit Message 一致：`<type>(<scope>): <description>`

**描述**：变更说明 + 变更类型（feat/fix/refactor/docs/test/chore）+ 关联 Issue + 测试情况 + 检查清单（lint 通过、有测试、无硬编码密钥）。

**Review**：至少 1 人 Approve + CI 全部通过；大型重构（>500 行）先提 Issue 讨论。

## 依赖管理

| 语言       | 锁文件           | 命令           |
| ---------- | ---------------- | -------------- |
| TypeScript | `pnpm-lock.yaml` | `pnpm install` |
| Go         | `go.sum`         | `go mod tidy`  |

新增依赖须在 PR 中说明理由，禁止引入已知安全漏洞的依赖版本。
