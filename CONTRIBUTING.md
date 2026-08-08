# 贡献指南

## 搭建环境

```bash
git clone <repo-url> && cd 回测平台
pnpm install
cd engine-go && go mod download && cd ..
cd data-fetcher && go mod download && cd ..
docker compose up -d
```

前置要求与常用命令见 `README.md` 与 `AGENTS.md`。IDE 推荐 VS Code（项目推荐扩展）或 WebStorm / GoLand。

## PR 提交规范

### 标题格式

与 Commit Message 一致：`<type>(<scope>): <description>`

### 描述模板

```markdown
## 变更说明

<!-- 简要描述本次 PR 做了什么 -->

## 变更类型

- [ ] feat - [ ] fix - [ ] refactor - [ ] docs - [ ] test - [ ] chore

## 关联 Issue

<!-- Closes #xxx -->

## 测试情况

<!-- 说明如何验证本次变更 -->

## 检查清单

- [ ] 本地 lint / format 已通过
- [ ] 新增代码有对应测试
- [ ] 无硬编码密钥或敏感信息
```

### Review 要求

- 所有 PR 至少需要 **1 人** Approve，CI 全部通过后方可合入
- 大型重构（> 500 行变更）建议先提 Issue 讨论方案

## 依赖管理

| 语言       | 锁文件           | 命令           |
| ---------- | ---------------- | -------------- |
| TypeScript | `pnpm-lock.yaml` | `pnpm install` |
| Go         | `go.sum`         | `go mod tidy`  |

新增依赖须在 PR 中说明理由，禁止引入带有已知安全漏洞的依赖版本。
