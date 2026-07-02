# 慢查询分析报告（T-I3）

> 基于 schema 与索引设计的 **EXPLAIN 分析建议**（本地 `EXPLAIN ANALYZE` 模板）。

## Top 5 查询

### 1. 批量历史价格（热路径）

```sql
EXPLAIN ANALYZE
SELECT ticker, date, close FROM prices
WHERE ticker = ANY($1) AND date >= $2 AND date <= $3 ORDER BY date;
```

- **索引**：`idx_prices_ticker_date (ticker, date)` — 已覆盖（`001_init.sql:31`）
- **建议**：读副本 + `getReadPool()`；超 50 ticker 考虑分批 ANY

### 2. Ticker 全文搜索

```sql
EXPLAIN ANALYZE
SELECT ticker FROM tickers WHERE search_vector @@ plainto_tsquery('simple', $1) LIMIT 20;
```

- **索引**：GIN on `search_vector`（`002_fts.sql`）
- **建议**：`LIMIT` 必带；高 QPS 时 Redis 缓存热门 query

### 3. Outbox 轮询

```sql
EXPLAIN ANALYZE
SELECT * FROM outbox WHERE processed_at IS NULL ORDER BY id LIMIT 100;
```

- **建议**：部分索引 `WHERE processed_at IS NULL`（若未建则 ADR 后续）

### 4. 用户登录

```sql
EXPLAIN ANALYZE SELECT id, password_hash, role FROM users WHERE username = $1;
```

- **索引**：`users.username` UNIQUE（`004_users.sql`）

### 5. CPI 按国家日期

```sql
EXPLAIN ANALYZE SELECT date, value FROM cpi_data WHERE country = $1 AND date BETWEEN $2 AND $3;
```

- **索引**：PK `(country, date)` — 已覆盖

## 未使用索引审计

```sql
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY relname;
```

定期运行，配合 `003_index_cleanup.sql` 清理冗余索引。
