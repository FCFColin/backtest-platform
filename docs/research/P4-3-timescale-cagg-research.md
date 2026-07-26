# P4-3: TimescaleDB 连续聚合（CAGG）扩展调研报告

> 生成日期：2026-07-26 | 状态：调研完成，迁移 SQL 已产出 | 决策建议：**下季度评估，当前查询延迟可接受**

## 1. 背景

当前平台已使用 TimescaleDB 的 hypertable 存储价格数据（`migrations/018_timescaledb.sql`），并有月度连续聚合（CAGG）。用户常用的时间范围查询（YTD/1Y/5Y/10Y/ALL）可通过预计算日度/周度聚合显著降低查询延迟。

## 2. 现状分析

### 2.1 当前数据模型

```sql
-- hypertable: price_data (ticker, date, open, high, low, close, volume)
-- 已有 CAGG: monthly_aggregate (月度 OHLCV 聚合)
```

### 2.2 查询模式

| 用户场景 | 时间范围  | 查询方式          | 预期 P50 延迟 |
| -------- | --------- | ----------------- | ------------- |
| YTD      | ~6 个月   | 直接查 hypertable | ~50-100ms     |
| 1Y       | ~1 年     | 直接查 hypertable | ~100-200ms    |
| 5Y       | ~5 年     | 直接查 hypertable | ~300-500ms    |
| 10Y      | ~10 年    | 直接查 hypertable | ~500-1000ms   |
| ALL      | ~20-30 年 | 直接查 hypertable | ~1-2s         |

### 2.3 瓶颈分析

当前直接查 hypertable 的瓶颈在于：

1. **I/O 读取**：30 年日度数据 ≈ 7000 行/标的，20 标的 = 140K 行
2. **聚合计算**：`first(open), max(high), min(low), last(close), sum(volume)` 在查询时实时计算
3. **网络传输**：140K 行 JSON 传输 ≈ 5-10MB

日度/周度 CAGG 可将 140K 行降至 ~3500 行（周度）或 ~700 行（月度），减少 95%+ 的 I/O。

## 3. CAGG 设计方案

### 3.1 日度聚合

```sql
CREATE MATERIALIZED VIEW daily_aggregate
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('1 day', date) AS day,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM price_data
GROUP BY ticker, time_bucket('1 day', date)
WITH NO DATA;
```

**用途**：日度聚合 ≈ 原始数据，但已去重/对齐交易日。主要用于精确日度回测。

### 3.2 周度聚合

```sql
CREATE MATERIALIZED VIEW weekly_aggregate
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('7 days', date) AS week,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM price_data
GROUP BY ticker, time_bucket('7 days', date)
WITH NO DATA;
```

**用途**：周度聚合将 30 年数据从 7000 行降至 ~1500 行。适合 5Y+ 范围的概览图表。

### 3.3 查询路由策略

```typescript
// 按时间范围自动选择 CAGG 层级
function selectPriceTable(startDate: string): string {
  const days = (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 180) return 'price_data'; // ≤6 月：直接查原始
  if (days <= 365 * 2) return 'daily_aggregate'; // ≤2 年：日度
  if (days <= 365 * 5) return 'weekly_aggregate'; // ≤5 年：周度
  return 'monthly_aggregate'; // >5 年：月度
}
```

### 3.4 存储开销估算

| CAGG              | 行数（30年/标的） | 存储/标的 | 总存储（1000 标的） |
| ----------------- | ----------------- | --------- | ------------------- |
| 原始 hypertable   | ~7000             | ~500KB    | ~500MB              |
| daily_aggregate   | ~7000             | ~300KB    | ~300MB              |
| weekly_aggregate  | ~1500             | ~80KB     | ~80MB               |
| monthly_aggregate | ~360              | ~20KB     | ~20MB               |
| **合计**          |                   |           | **~900MB**          |

总存储增加 ~80%（~400MB），在可接受范围内。

### 3.5 刷新策略

- **实时 CAGG**：`timescaledb.continuous` 自动增量刷新（新数据写入后 ~1-5 分钟内聚合）
- **历史回填**：`CALL refresh_continuous_aggregate('daily_aggregate', '2000-01-01', '2026-07-26')`
- **压缩**：对 >30 天的 CAGG 数据启用 TimescaleDB columnar compression

## 4. 迁移 SQL

已产出 `migrations/027_timescale_cagg.sql`，包含：

- 日度 CAGG 创建
- 周度 CAGG 创建
- 历史数据回填
- 压缩策略

**注意**：此迁移需在 TimescaleDB 扩展已安装的环境执行（`migrations/018_timescaledb.sql` 已安装扩展）。无法在本地 Windows 环境验证，需 Docker + TimescaleDB 或云环境。

## 5. 决策建议

### **下季度评估，当前不推进**

**理由**：

1. 当前内测阶段查询延迟可接受（P95 < 1s）
2. CAGG 增益在用户量/数据量增长后才显著
3. 需修改查询层路由逻辑（`dataFacade.ts` / `dataQuery.ts`），工作量中等
4. 无法本地验证（需 TimescaleDB 环境）

### 推进触发条件

1. 价格查询 P95 > 500ms（从 Prometheus `data_fetch_duration_*` 指标监控）
2. 标的数量 > 1000（当前 < 100）
3. 用户反馈长周期回测（10Y+）数据加载慢

---

_本报告基于代码库 commit 2427c35 的实际架构分析_
