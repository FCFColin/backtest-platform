# Comprehensive Codebase Cleanup

Date: 2026-07-09
Status: Design Approved

## Goal

在不改变任何功能的前提下，系统性地完成代码库最后的清理优化工作。ESLint 已清零 (513→0)，TypeScript 通过，2956+ 测试通过。剩余工作量集中在文件级清理、配置审计、死代码分析和大文件评估。

## Phase 1: 文件级清理（零风险）

| 项目                                                                                                                   | 操作             | 原因                                |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- |
| `.trae/documents/`                                                                                                     | 删除空目录       | Trae IDE 遗留空目录                 |
| `docs/inspections/archive/ARCHIVED.md`                                                                                 | 删除             | 内容已合并到 `2026-07-08-report.md` |
| 提交已 stage 的删除：`package-lock.json`, `.pre-commit-config.yaml`                                                    | git commit       | 清理 git index                      |
| 提交未 stage 的删除：`Dockerfile`, `packages/backend/src/db/importBulk.ts`, `packages/backend/src/engine/portfolio.ts` | git add + commit | 工作区已删除，同步到仓库            |

## Phase 2: 配置卫生

| 项目          | 操作                             |
| ------------- | -------------------------------- |
| `.gitignore`  | 添加 `docs/inspections/archive/` |
| `vercel.json` | 保留（合法的 Vercel 部署配置）   |

## Phase 3: Knip 死代码审计

安装 `knip` 作为 devDependency，运行死代码分析，清理未使用的导出/文件。

## Phase 4: Go 引擎大文件评估

| 文件                                          | 行数 | 评估                 |
| --------------------------------------------- | ---- | -------------------- |
| `engine-go/internal/montecarlo/montecarlo.go` | 909  | 评估是否可提取子函数 |
| `engine-go/internal/engine/backtest.go`       | 850  | 评估是否拆分         |

原则：如果函数已经有良好结构，不做拆分；如果有明显的提取点则拆分。

## Phase 5: 大测试文件评估

| 文件                                          | 行数 |
| --------------------------------------------- | ---- |
| `tests/unit/routes/backtest-routes.test.ts`   | 1093 |
| `tests/unit/services/data-service.test.ts`    | 856  |
| `tests/unit/middleware/refresh-token.test.ts` | 851  |

## Phase 6: 依赖审计

检查 `packages/backend/package.json` + `packages/frontend/package.json` 中的未使用依赖。

## 验证策略

每阶段完成后验证：

1. `npm run check` (TypeScript)
2. `npm run lint` (ESLint)
3. `npm run test` (Vitest)
4. `git status` 确认无意外变更
