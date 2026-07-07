# 代码库自检报告归档

> 本目录存放按 `.trae/specs/establish-codebase-self-inspection/` 流程产出的自检报告。

## 命名规范

- 活跃报告：`YYYY-MM-DD-report.md`（如 `2026-07-08-report.md`）
- 历史报告：移入 `archive/` 子目录

## 流程依据

- Spec：`.trae/specs/establish-codebase-self-inspection/spec.md`
- 任务：`.trae/specs/establish-codebase-self-inspection/tasks.md`
- 核验：`.trae/specs/establish-codebase-self-inspection/checklist.md`

## 报告结构

每份报告 MUST 包含：

1. Tier A 自动化门控基线表（命令 / 结果 / 量化指标）
2. Tier B 架构合规逐项结论（符合/偏离 + 证据位置）
3. Tier C 横切风险逐项结论（按风险分级）
4. 风险分级汇总表（Critical / Required / Optional / FYI）
5. P0/P1/P2/P3 行动清单（含位置与最小修复路径）
6. 门控结论（本次自检后合并是否放行）

## 风险分级

| 级别     | 合并门控                 |
| -------- | ------------------------ |
| Critical | 修复后方可合并           |
| Required | 合并前修复或登记 P1 任务 |
| Optional | 登记 backlog，不阻塞     |
| FYI      | 仅记录，无行动           |

## archive/ 说明

`archive/` 存放被本 spec 取代的历史散落自检文件（原位于仓库根目录），保留以供历史追溯，不再作为活跃流程入口。
