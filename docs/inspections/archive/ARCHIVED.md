# 已归档历史自检文件

> **状态：已废弃（SUPERSEDED）**
> **取代者**：`.trae/specs/establish-codebase-self-inspection/spec.md`

本目录下的文件原位于仓库根目录，是 2026-07 期间多次临时组织的自检产物。它们已被 `establish-codebase-self-inspection` spec 取代，原因：

> **归档时状态（2026-07-08）**：执行归档时上述 13 个文件已不在仓库根目录（被先前的工作区变更移除）。本文件作为"已废弃"记录保留，不再物理迁移源文件。根目录已无 `inspection-task*.md` 与 `self-inspection-report*.md` 活跃入口。

1. **散落且无权威源**：13 个临时文件依赖上下文记忆，违反"多固化需求文档"原则；
2. **不可重复**：每次自检从零组织，无统一流程、门控阈值与报告模板；
3. **口径漂移**：同一指标在不同报告间矛盾（如 ESLint 错误数 2322 vs 通过、未格式化文件数 195 vs 487）；
4. **未反映最新架构**：旧报告引用的 ADR 数量、Go 引擎 fail-closed 边界与现状脱节。

## 归档文件清单

历史 inspection-task 系列（10 份）：

- `inspection-task1-code-quality.md`
- `inspection-task2-architecture.md`
- `inspection-task3-test-quality.md`
- `inspection-task4-security.md`
- `inspection-task5-performance.md`
- `inspection-task6-dependencies.md`
- `inspection-task7-documentation.md`
- `inspection-task8-observability.md`
- `inspection-task9-database.md`
- `inspection-task10-config-build.md`

历史 self-inspection-report 系列（3 份）：

- `self-inspection-report.md`
- `self-inspection-report-2026-07-03.md`
- `self-inspection-report-2026-07-07.md`

## 使用说明

这些文件仅作历史追溯用途，**不再作为活跃流程入口**。后续自检一律以 `.trae/specs/establish-codebase-self-inspection/` 为流程依据，报告写入 `docs/inspections/YYYY-MM-DD-report.md`。
