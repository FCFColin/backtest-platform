# ADR-029: Cursor 分页 vs Offset 分页

| 字段 | 值         |
| ---- | ---------- |
| 状态 | 已接受     |
| 日期 | 2026-06-25 |

## Context

`dataManageRoutes.ts` 使用 offset 分页（`page` + `limit`）。

## Decision

- **当前（<10 万 tickers）**：保留 offset，实现简单，管理端可跳页。
- **切换条件**：单表 >50 万行或深页 P95>500ms（EXPLAIN 显示 Seq Scan）。
- **目标方案**：cursor=`updated_at,id` 复合游标，响应含 `nextCursor`。

## Consequences

- 优势：避免过早过度设计
- 劣势：超规模前需迁移 API（v2 或 query 参数 `cursor`）
