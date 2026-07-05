# ADR-038: CI 分层与依赖方向强制

> **企业理由**：CI 全量并行导致 PR 等待时间过长（~15min），且无分层意味着深层问题（类型错误、集成测试失败）在浅层问题（lint、格式）之前就已运行，浪费资源。同时缺少依赖方向校验，容易产生循环依赖或反向依赖等违反架构约定的情况。

| 字段   | 值                                                                      |
| ------ | ----------------------------------------------------------------------- |
| 状态   | 已实施                                                                  |
| 日期   | 2026-07-05                                                              |
| 决策者 | 架构组                                                                  |
| 范围   | CI 编排、依赖管理、质量门禁                                              |
| 关联   | ADR-021（复杂度量化门控）、ADR-004（Express 框架选型）                   |

## Decision（决策内容）

### CI 分层（`.github/workflows/ci.yml`）

将 CI job 分为两层：

- **required（快速反馈，~3min）**：lint、prettier、TypeScript 类型检查（`tsc --noEmit`）、单元测试（`vitest run --project unit`）。这些 job 必须在 PR 合并前通过，阻塞合并。
- **optional（深度检查，~12min）**：集成测试、契约测试、E2E 测试、属性测试、安全扫描。这些 job 失败不阻塞合并，但会在 PR 上标注失败。

分层依据：required 层覆盖所有静态分析与纯逻辑验证；optional 层覆盖运行时行为与环境集成。

### 依赖方向强制（dependency-cruiser）

引入 `dependency-cruiser`（`.dependency-cruiser.js`）校验以下规则：

- `api/` 中的模块允许依赖 `shared/` 和 `packages/`，但禁止反向依赖
- `packages/` 中的模块允许依赖 `shared/`，但禁止依赖 `api/`
- `engine-go/` 和 `data-fetcher/` 禁止依赖任何 TypeScript 模块
- 禁止循环依赖（任何层级）
- 禁止 `src/` 内部的跨层反向引用（如 `services/` 依赖 `routes/`）

依赖检查在 CI 中作为 required job 运行，违反即阻断。

## Consequences（后果）

### 正面

- PR 开发者 ~3min 即可获得核心反馈，不需要等待全量 job 完成
- 依赖方向被机械性强制，架构约定不会被意外破坏
- 可选深度 job 持续提供质量数据，但不阻塞交付

### 负面

- CI 配置复杂度增加（job 依赖、条件触发）
- dependency-cruiser 规则需要随架构演进维护
- 开发者需理解分层含义（optional job 失败不是合并障碍，但仍需关注）
