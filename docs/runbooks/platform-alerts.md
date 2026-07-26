# 平台告警 Runbook（Platform Alerts）

> **企业理由**：P1-10 部署 AlertManager + 告警规则后，每个告警必须有可执行的处置流程。
> 本 runbook 对应 `k8s/prometheus-rules.yaml` 与 `docker/prometheus/rules.yml` 中
> 各告警 `runbook_url` 注解的锚点，oncall 收到告警后按对应章节处置。

---

## 告警分级

| 级别   | severity | 响应时效  | 通知通道                                 |
| ------ | -------- | --------- | ---------------------------------------- |
| **P0** | critical | 立即响应  | 飞书 + 钉钉（group_wait 0s，repeat 30m） |
| **P1** | warning  | 30 分钟内 | 飞书（group_wait 30s，repeat 1h）        |
| **P2** | info     | 记录      | 飞书（repeat 4h）                        |

AlertManager 抑制规则：同 `service` 的 P0 触发时抑制 P1，避免告警风暴。

---

## P0 告警

### GoEngineDown {#go-engine-down}

- **含义**：Go 回测引擎抓取失败（`up{job="engine-go"} == 0`）持续 1m。
- **影响**：ADR-031 下引擎不可用 → API fail-closed 返回 503 + Retry-After，回测/蒙特卡洛/优化全部不可用。
- **排查**：
  1. `kubectl -n backtest-platform get pods -l app=engine-go` 查看 Pod 状态。
  2. 检查 `/api/engine/health`：`kubectl exec -it <api-pod> -- wget -qO- http://engine-go:5004/api/engine/health`。
  3. 看 Pod 日志：`kubectl -n backtest-platform logs -l app=engine-go --tail=200`。
  4. 若资源不足触发 OOMKilled，调高 limits 或 HPA 扩容。
- **恢复**：Pod 重启后 `up` 恢复 1，告警自动 resolve。

### CircuitBreakerOpen {#circuit-breaker-open}

- **含义**：熔断器处于 Open（`circuit_breaker_state == 1`，0=closed/1=open/2=halfOpen）。
- **影响**：相关依赖（Go 引擎 / PostgreSQL）调用快速失败（ADR-016）。
- **排查**：按 `name` 标签定位是哪个熔断器（go-engine / postgres），检查对应依赖健康。
- **恢复**：依赖恢复后熔断器进入 halfOpen → closed，告警 resolve。

### PostgresDown {#postgres-down}

- **含义**：`pg_up == 0` 持续 30s。
- **影响**：PostgreSQL 主数据存储不可用（ADR-007），认证/回测/审计全线受影响。
- **排查**：
  1. `kubectl -n backtest-platform get pods -l app=postgres`。
  2. 检查磁盘：`kubectl exec <pg-pod> -- df -h /var/lib/postgresql/data`。
  3. 检查 PgBouncer 连接池是否耗尽。
  4. 看 PG 日志：`kubectl logs <pg-pod> --tail=200`。
- **恢复**：PG 进程恢复后 `pg_up` 恢复 1。

### BacktestQueueDepth {#backtest-queue-depth}

- **含义**：BullMQ 队列深度 > 100 持续 5m（`bullmq_queue_size > 100`）。
- **影响**：回测任务积压，用户等待时间变长（ADR-011 异步化）。
- **排查**：
  1. 检查 Worker 副本数与引擎吞吐。
  2. 查看是否有卡死任务：Redis `BULLMQ:<queue>:active`。
  3. 必要时 HPA 扩容 API / 引擎副本。

### RedisDown {#redis-down}

> 由 P0-05 定义，处置见 `docs/runbooks/redis-sentinel.md`（如存在）或 `dr-runbook.md` 第 4 节。

---

## P1 告警

### HighErrorRate {#high-error-rate}

- **含义**：5xx 错误率 > 5% 持续 5m。
- **排查**：按 route 拆分：`sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)`。
  - 若集中在 `/api/backtest/*`：可能引擎 fail-closed 503。
  - 若集中在认证端点：检查 JWT / API Key 服务。
- **恢复**：错误率回落 < 5%，告警 resolve。

### ReplicationLag {#replication-lag}

- **含义**：PG 复制延迟 > 5s 持续 2m（`pg_replication_lag_seconds > 5`）。
- **影响**：读副本数据滞后影响只读查询一致性（P1-03 读写分离）。
- **排查**：`SELECT * FROM pg_stat_replication;` 查看具体滞后，检查从库负载与长事务。

### HighLatency {#high-latency}

- **含义**：HTTP P99 延迟 > 1s 持续 5m。
- **排查**：按 route 拆分定位慢端点：`histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))`。
  - DB 慢查询：`pg_stat_statements`。
  - 引擎计算密集：检查 engine-go CPU。
  - 事件循环阻塞：检查 `node_eventloop_lag_seconds`。

### DiskSpaceLow {#disk-space-low}

- **含义**：磁盘可用空间 < 10% 持续 5m。
- **影响**：PG WAL / Redis AOF / 日志占满磁盘会导致服务不可用。
- **排查**：
  1. 定位挂载点：`df -h`。
  2. 清理日志：`kubectl logs` 轮转、应用日志压缩。
  3. 扩容 PVC 卷。
  4. 检查 PG WAL 归档是否正常。

---

## 通知通道配置

- 飞书/钉钉 Webhook 通过环境变量注入（见 `k8s/alertmanager-deployment.yaml` Secret `alertmanager-webhooks`）。
- 本地无 webhook 时，`FEISHU_WEBHOOK` / `DINGTALK_WEBHOOK` 留空，AlertManager 静默（仅日志），便于本地验证告警链路。
