# 贡献指南

> **企业理由**：统一的贡献规范能降低协作摩擦、减少代码审查中的低级争议、保证多语言多运行时项目的一致性与可维护性，从而加速交付并降低线上故障风险。

---

## 目录

1. [本地开发环境搭建](#1-本地开发环境搭建)
2. [代码风格规范](#2-代码风格规范)
3. [Commit Message 格式](#3-commit-message-格式)
4. [分支策略](#4-分支策略)
5. [PR 提交规范](#5-pr-提交规范)
6. [测试要求](#6-测试要求)
7. [多语言项目注意事项](#7-多语言项目注意事项)
8. [供应链安全](#8-供应链安全)

---

## 1. 本地开发环境搭建

本项目为多语言架构，请根据你所负责的模块安装对应工具链。

### 必备工具

| 工具    | 最低版本 | 用途                                               |
| ------- | -------- | -------------------------------------------------- |
| Node.js | 20+      | 前端 / API 服务                                    |
| Go      | 1.26+    | 计算引擎 (engine-go) + 数据抓取服务 (data-fetcher) |
| Docker  | 20.10+   | 容器化构建与本地服务编排                           |
| Git     | 2.40+    | 版本控制                                           |

> Rust 计算引擎（engine-rs）与 Python 数据 CLI（api/python）已退役并删除（ADR-008），不再是开发前置条件。

### 搭建步骤

```bash
# 1. 克隆仓库
git clone <repo-url> && cd 回测平台

# 2. 安装 Node.js 依赖
pnpm install

# 3. 安装 Go 依赖（计算引擎 engine-go + 数据服务 data-fetcher）
cd engine-go && go mod download && cd ..
cd data-fetcher && go mod download && cd ..

# 4. 使用 Docker 启动本地依赖服务
docker compose up -d
```

### IDE 推荐

VS Code（项目推荐扩展）或 WebStorm / GoLand 均可。

---

## 2. 代码风格规范

各语言须遵循对应的 Lint 和格式化工具配置，CI 会强制检查。

### TypeScript

- **格式化**：Prettier（配置见项目根目录 `.prettierrc.json`）
- **Lint**：ESLint（配置见 `eslint.config.js`）
- 运行：`pnpm lint` / `pnpm format`

### Go

- **格式化**：`gofmt`（Go 内置）
- **Lint**：`golangci-lint`（配置见 `data-fetcher/.golangci.yml`）
- 运行：`cd engine-go && golangci-lint run ./...`（data-fetcher 同理）

> **原则**：提交前务必在本地运行对应语言的 lint 和格式化，确保 CI 不报错。

---

## 3. Commit Message 格式

采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[可选 body]

[可选 footer]
```

### Type 列表

| Type       | 说明                   |
| ---------- | ---------------------- |
| `feat`     | 新功能                 |
| `fix`      | 修复 Bug               |
| `docs`     | 文档变更               |
| `refactor` | 重构（不改变外部行为） |
| `test`     | 新增或修改测试         |
| `chore`    | 构建、依赖、工具等杂项 |

### 示例

```
feat(data-fetcher): 添加 A 股日线数据抓取接口
fix(optimizer): 修复蒙特卡洛模拟内存泄漏
chore: 升级 Go 1.26 依赖
```

> **注意**：scope 建议与模块目录名一致，如 `data-fetcher`、`api`、`engine` 等。

---

## 4. 分支策略

```
main          ← 受保护，仅通过 PR 合入，禁止直接推送
  └── feature/*   ← 功能开发分支
  └── fix/*       ← Bug 修复分支
  └── refactor/*  ← 重构分支
```

### 规则

- `main` 受保护：PR + 至少 1 人 Review + CI 通过后才能合入，合并后删除源分支
- 从 `main` 拉取 `feature/<简短描述>` / `fix/` / `refactor/` 分支，命名使用小写英文 + 短横线

---

## 5. PR 提交规范

### 标题格式

与 Commit Message 一致：`<type>(<scope>): <description>`

### 描述模板

```markdown
## 变更说明

<!-- 简要描述本次 PR 做了什么 -->

## 变更类型

- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 重构 (refactor)
- [ ] 文档 (docs)
- [ ] 测试 (test)
- [ ] 杂项 (chore)

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

- 所有 PR 至少需要 **1 人** Approve
- CI 全部通过（lint、测试、构建）后方可合入
- 涉及多语言变更时，请邀请对应语言方向的 Reviewer
- 大型重构（> 500 行变更）建议先提 Issue 讨论方案

---

## 6. 测试要求

### 单元测试

- 每个模块须有单元测试，覆盖核心逻辑路径
- Go：`go test ./...`，目标覆盖率 ≥ 70%
- TypeScript：`pnpm test`（Vitest），目标覆盖率 lines/functions/statements ≥80%, branches ≥70%（以 `scripts/check-coverage.mjs` 为权威源）

### 测试目录结构

本项目按测试类型分目录组织，结构如下：

| 测试类型    | 目录                 | 说明                                     |
| ----------- | -------------------- | ---------------------------------------- |
| 单元测试    | `tests/unit/`        | 模块级独立逻辑测试，mock 外部依赖        |
| 集成测试    | `tests/integration/` | 多模块协作、API 与数据库交互验证         |
| 契约测试    | `tests/contract/`    | 服务间接口契约验证，防止破坏性变更       |
| 混沌测试    | `tests/chaos/`       | 故障注入下的系统韧性验证                 |
| 属性测试    | `tests/property/`    | 基于不变式的属性测试（fast-check）       |
| E2E UI 测试 | `tests/e2e/ui/`      | 关键业务流程的 Playwright 端到端 UI 测试 |
| 测试辅助    | `tests/helpers/`     | 共享测试夹具与 mock                      |

- E2E UI 测试覆盖关键业务流程（数据抓取 → 回测计算 → 结果输出），可用 Docker Compose 搭建完整测试环境

### 测试命名

```
Test<功能>_<场景>_<预期结果>
```

示例：`TestFetchDailyData_NormalInput_ReturnsOHLCV`

---

## 7. 多语言项目注意事项

### 依赖管理

| 语言       | 锁文件           | 命令           |
| ---------- | ---------------- | -------------- |
| TypeScript | `pnpm-lock.yaml` | `pnpm install` |
| Go         | `go.sum`         | `go mod tidy`  |

- 新增依赖须在 PR 中说明理由，避免引入功能重复的包
- 禁止引入带有已知安全漏洞的依赖版本

### 跨语言调用

- TypeScript 调用 Go 计算引擎（engine-go）：经 `utils/engineClient.ts` HTTP 调用，引擎不可用时 fail-closed 返回 503（ADR-031）
- TypeScript 调用 Go 数据服务（data-fetcher）：通过 HTTP API

### 编码约定

- 所有源文件 UTF-8 + LF 换行（`.editorconfig` 强制），文件末尾保留空行，行尾无空白

### 文档与注释

- 公共 API 须有文档注释（TypeScript: JSDoc / Go: godoc）
- 注释语言与代码上下文保持一致，公共文档使用中文

---

## 8. 供应链安全

> 依赖方向强制（dependency-cruiser）、SBOM(CycloneDX, nightly) 见 ADR-052。

- 新增依赖须在 PR 中说明理由，禁止引入功能重复或带已知漏洞的包
- 本地依赖审计：`pnpm audit:supply`（`pnpm audit --audit-level=high --prod`）
- 密钥扫描：husky pre-commit 强制 gitleaks，未安装即拒绝提交
