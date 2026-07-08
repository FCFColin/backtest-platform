# 代码库全面清理设计文档

日期：2026-07-08
状态：已批准

## 目标

在不改变任何功能的前提下，清理根目录残留文件、整理依赖配置、更新失效文档引用、审计死代码。

## Phase 1：删除已忽略的残留文件

**文件清单**（均被 `.gitignore` 覆盖）：

- ESLint .txt（12 个）：`all-eslint.txt`, `all-warnings.txt`, `api-lint.txt`, `eslint-components-check.txt`, `eslint-current.txt`, `eslint-result.txt`, `eslint-simple-check.txt`, `eslint-simple-result.txt`, `lint-warnings.txt`, `medium-check.txt`, `simple-check.txt`, `warnings-unix.txt`
- ESLint .json（5 个）：`eslint-all.json`, `eslint-pages-current.json`, `eslint-pages.json`, `eslint-results.json`, `eslint-simple.json`
- Logs（6 个）：`server.log`, `server-out.log`, `server-err.log`, `client-out.log`, `client-err.log`, `btr.log`
- 其他（5 个）：`server.err`, `parse-eslint.mjs`, `parse-lint.mjs`, `parse-pages.mjs`, `coverage/`, `test-results/`

**操作**：`Remove-Item` 删除文件系统。不涉及 git 跟踪文件。

**验证**：`npm run check` + `npm run test` 全绿。

## Phase 2：配置整理

### 2.1 依赖去重

- 后端运行时依赖：从根 `devDependencies` 移到 `packages/backend/package.json` 的 `dependencies`
- 与子包重复的 devDependencies：从根删除
- 根保留：工具链和 workspace 引用

### 2.2 Docker

- 删除 `Dockerfile.distroless`
- 修复 `docker-compose.yml` Redis 镜像 sha256 占位符

### 2.3 评估 `vercel.json`

## Phase 3：文档更新 + 死代码审计

### 3.1 文档路径修复

- `docs/ARCHITECTURE.md`：修复路径和引用
- `docs/domain-refactor-roadmap.md`：更新路径
- `docs/runbook.md`：指标名同步
- `CODE_SIMPLIFICATION_PLAN.md`：添加完成标记

### 3.2 Knip 死代码审计

## 验证策略

每阶段完成后串行验证：

1. `npm run check`（TypeScript）
2. `npm run lint`（ESLint）
3. `npm run test`（Vitest）
4. `git status` 确认无意外变更
