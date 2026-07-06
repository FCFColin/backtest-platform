# ADR-042: 合并 api/ 与 packages/backend 代码库

> **企业理由**：回测平台在演进过程中产生了 `api/` 和 `packages/backend/src/` 两个近似的后端代码副本，
> 存在 30+ 对重复文件。双副本导致 Bug 修复和功能迭代需同步改动两处，已造成多处不同步（`packages/backend/`
> 自重构后不可构建、不可测试）。合并为单一代码库是消除维护债务的必要举措。

| 字段   | 值                                                                  |
| ------ | ------------------------------------------------------------------- |
| 状态   | 已实施                                                              |
| 日期   | 2026-07-06                                                          |
| 决策者 | 架构组                                                              |
| 范围   | 后端代码库（api/ + packages/backend/ + packages/shared/ + shared/） |
| 关联   | ADR-008（Go + TypeScript 架构）、ADR-031（单引擎 fail-closed）      |

## 决策

迁移方向：**`api/` → `packages/` 架构**。保留 `packages/backend/` 的拆分架构，将 `api/` 的功能迁移过去。

## 实施结果

### 阶段 1：共享类型对齐 ✅

- `shared/constants.ts` 同步了 `TRADING_DAYS_PER_YEAR_US` 常量
- 共享类型文件已确认内容一致（仅 CRLF/LF 差异）

### 阶段 2：目录合并 ✅

- `api/` 全部 138 个文件复制到 `packages/backend/src/`，覆盖已有文件
- 导入路径从 `../../shared/xxx.js` 重写为 `@backtest/shared/xxx`（去 `.js` 扩展名以兼容 pnpm exports map）
- `packages/backend/` 加入 `tsconfig.backend.json` 的 include 列表
- `packages/backend/package.json` 精简为仅保留 `@backtest/shared: workspace:*` 依赖（避免 pnpm 安装独立副本导致 vitest mock 失效）

### 阶段 3：测试导入路径重写 ✅

- 全部 132 个测试文件的导入路径从 `../../../api/` 改为 `../../../packages/backend/src/`
- vi.mock 路径同步更新
- 关键问题修复：`packages/backend/package.json` 中重复的依赖项（opossum@8.5.0 vs 9.0.0）导致 vitest mock 拦截失效

### 阶段 4：依赖对齐 ✅

- 移除 `packages/backend/package.json` 中所有与根重复的依赖（根已有全部依赖）
- 消除了版本偏差隐患（jose、opossum、pino、stripe 等之前在两处有不同版本）
- 所有依赖统一在根 `package.json` 中管理

### 阶段 5：清理与验证 ✅

- `api/` 目录已删除
- `nodemon.json` 更新为指向 `packages/backend/src/server.ts`
- `package.json` 脚本更新（profile:flame、import:market-data、depcheck）
- `vitest.config.backend.ts` 覆盖率路径更新
- 全部 **2743 项测试通过**，142 个测试文件
- 前端 TypeScript 类型检查通过

## 测试验证

```
$ pnpm run check:frontend → 通过 (0)
$ pnpm run test:unit → 142 files, 2743 tests passed
```

## 风险与缓解

| 风险                  | 缓解措施                                         |
| --------------------- | ------------------------------------------------ |
| 依赖版本不兼容        | 移除 packages/backend/ 的重复依赖，统一由根管理  |
| 导入路径遗漏          | 批量替换 + 全部 2743 测试验证                    |
| Dockerfile 引用旧路径 | Dockerfile 使用 npm 而非 pnpm，不在本 ADR 范围内 |

## 待后续处理

- Dockerfile（根）仍引用旧的 `api/` 路径——需独立清理（该 Dockerfile 使用 npm 而非 pnpm，属于过时构建路径）
- `shared/` 与 `packages/shared/` 的双目录未合并（内容一致，保留以兼容外层导入）
