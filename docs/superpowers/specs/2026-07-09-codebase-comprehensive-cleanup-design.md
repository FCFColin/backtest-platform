> **[已取代]** 本文档已被 `.trae/specs/codebase-cleanup/` 下的新 spec 取代（2026-07-10）。新 spec 基于实际诊断结果，修正了本文档中与现状不符的数据。

# Codebase Comprehensive Cleanup Design

## Overview

全面清理 回测平台 codebase：删除死代码、合并小文件、拆分大文件、整合配置、简化文档。
所有文件控制在 ≤250 行，保持项目可运行、类型检查通过、测试通过。

## Architecture & Strategy

### Core Rules

| Rule                 | Description                                        |
| -------------------- | -------------------------------------------------- |
| File size            | 每个文件 ≤250 行（数据/配置/生成的 lock 文件除外） |
| Merge scope          | 逻辑相关的文件合并，按领域/功能分组                |
| Split strategy       | 大文件按功能/渲染/逻辑拆分                         |
| No public API change | 不改变模块对外导出的签名                           |
| ESM imports          | 保持 `.js` 扩展名导入路径                          |
| No side effects      | 清理不改变运行时行为                               |

### Batch Plan

| Batch | Phase                              | Scope                                          | Validation               |
| ----- | ---------------------------------- | ---------------------------------------------- | ------------------------ |
| 1     | Dead code & empty dirs             | .trae/, lib/, dev/null, bs_test                | pnpm check + lint + test |
| 2     | Merge small frontend files         | <50 lines → merge into logical parents         | pnpm check + lint + test |
| 3     | Merge small backend/shared files   | <50 lines → merge into logical parents         | pnpm check + lint + test |
| 4     | Merge small test/scripts/k8s files | <50 lines → merge into logical parents         | pnpm check + lint + test |
| 5     | Split large frontend files         | >250 lines → split by component/hook/logic     | pnpm check + lint + test |
| 6     | Split large backend files          | >250 lines → split by service/route/engine     | pnpm check + lint + test |
| 7     | Split large Go engine files        | >250 lines → split by concern                  | pnpm check + lint + test |
| 8     | Split large test files             | >250 lines → split by scenario                 | pnpm check + lint + test |
| 9     | Consolidate config files           | 7 vitest → 1, 6 tsconfig → 3                   | pnpm check + lint + test |
| 10    | Simplify docs                      | Merge small <50 line docs into ARCHITECTURE.md | pnpm check               |

## Data Flow

### Merge Pattern

```
Small File A (<50 lines) ─┐
Small File B (<50 lines) ─┤→ MergedFile.ts (≤250 lines)
Small File C (<50 lines) ─┘
  ↑ All imported by same module or same domain
```

### Split Pattern

```
LargeFile.ts (750 lines) → SplitLogic.ts (≤250 lines)
                         → SplitUI.tsx (≤250 lines)
                         → SplitUtils.ts (≤250 lines)
                         → index.ts (barrel, ≤250 lines)
```

## Component Architecture

### Frontend Page Split Template

```
pages/page-name/
├── index.tsx       (page shell, routing, ≤250 lines)
├── PageForm.tsx    (input/params form, ≤250 lines)
├── PageResults.tsx (results display, ≤250 lines)
├── PageUtils.ts    (helper functions, ≤250 lines)
└── types.ts        (types, ≤250 lines)
```

### Backend Service Split Template

```
src/services/
├── serviceName/
│   ├── index.ts      (barrel exports, ≤250 lines)
│   ├── service.ts    (core logic, ≤250 lines)
│   ├── helpers.ts    (utilities, ≤250 lines)
│   └── types.ts      (types, ≤250 lines)
```

## Validation

### Per-Batch Verification

```bash
pnpm check          # TypeScript type check
pnpm lint --fix     # ESLint auto-fix
pnpm test           # Test suite
```

### Final Verification

```bash
pnpm check && pnpm lint && pnpm test && pnpm test:e2e
```

## File Manifest

### Batch 1 - Delete

- `.trae/` — empty directory
- `packages/frontend/src/lib/` — empty directory
- `data-fetcher/dev/null` — artifact file
- `data-fetcher/cmd/bs_test/main.go` — unused test command

### Batch 2-4 - Merge Candidates (example)

- Frontend: navIconData.ts → navConfig.ts, types.ts → constants.ts
- Backend: many small schemas/* → schemas/backtest.ts, domain/value-objects/* → index.ts
- Shared: pca.ts/optimizer.ts/letf.ts/goal.ts → backtest.ts
- Tests: small .spec.ts files → combine by domain

### Batch 5-8 - Split Candidates (example)

- Frontend: MonteCarloResults.tsx (826), TacticalGridPage.tsx (745), FactorRegressionPage.tsx (750)
- Backend: db/import.ts (494), config/index.ts (455), db/index.ts (451)
- Go: montecarlo.go (753), backtest.go (715), statistics.go (590)

### Batch 9 - Config Consolidation

- 7 vitest config files → 1 vitest.config.ts
- 6 tsconfig files → 3 (base + backend + frontend)

## Risk Mitigation

| Risk                                      | Mitigation                                                 |
| ----------------------------------------- | ---------------------------------------------------------- |
| Merge breaks imports                      | Update all import paths; run `pnpm check` after each batch |
| Split breaks route/component registration | Update all re-exports; verify page navigation              |
| Go compilation failure                    | `go build ./...` after each Go change                      |
| Test structure mismatch                   | Update test imports; verify all test suites pass           |
