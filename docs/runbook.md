# 运维手册（Runbook）

> 最后更新：2026-06-25  
> 适用版本：企业级 Round 2 实施后

## 一、服务架构概览

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  前端 Vite   │───▶│  后端 API     │───▶│  Go 引擎     │
│  port 5173  │    │  Express      │    │  :5002/5004 │
└─────────────┘    │  port 5001    │    └──────┬──────┘
                   └──────┬───────┘           │ fail-closed 503
                          │                   (ADR-031)
                   ┌──────┴───────┐
                   │  Go 数据服务  │
                   │  port 5003   │
                   └──────┬───────┘
                          ▼
                   ┌─────────────┐    ┌─────────────┐
                   │ PostgreSQL  │    │   Redis     │
                   └─────────────┘    └─────────────┘
```

| 服务         | 端口      | 启动命令                              | 健康检查                                       |
| ------------ | --------- | ------------------------------------- | ---------------------------------------------- |
| 前端（开发） | 5173      | `npm run client:dev`                  | `curl http://localhost:5173`                   |
| 后端 API     | 5001      | `npm run dev`                         | `curl http://localhost:5001/api/health`        |
| Go 引擎      | 5002/5004 | `cd engine-go && go run ./cmd/server` | `curl http://127.0.0.1:5002/api/engine/health` |
| Go 数据服务  | 5003      | `cd data-fetcher && go run .`         | `curl http://localhost:5003/api/data/health`   |

## 二、启动与停止

### 开发环境一键启动

```powershell
# 启动前端 + 后端（concurrently）
npm run dev

# 单独启动 Go 引擎（另一个终端）
cd engine-go; go run ./cmd/server

# 单独启动 Go 数据服务（另一个终端）
cd data-fetcher; go run .
```

### 生产环境启动

```powershell
# 1. 构建前端
npm run build

# 2. 启动 Go 引擎
cd engine-go; go run ./cmd/server &

# 3. 启动 Go 数据服务
cd data-fetcher; go run . &

# 4. 启动后端 API（托管 dist/ 静态文件）
NODE_ENV=production node --import tsx api/app.ts
```

### 停止服务

```powershell
# 查找并停止各服务
Get-Process -Name "node","go" -ErrorAction SilentlyContinue | Stop-Process
```

## 三、健康检查与监控

### 健康检查端点

```powershell
# 后端 API 健康（含引擎状态 + metrics）
curl http://localhost:5001/api/health

# 引擎 metrics（Go 引擎可用率、调用失败数）
curl http://localhost:5001/api/metrics

# Go 引擎健康
curl http://127.0.0.1:5002/api/engine/health

# Go 数据服务健康
curl http://localhost:5003/api/data/health
```

### 关键指标

| 指标              | 获取方式                                                    | 告警阈值         |
| ----------------- | ----------------------------------------------------------- | ---------------- |
| Go 引擎熔断状态   | `/api/metrics` → `circuit_breaker_state{name}`              | == 1（熔断打开） |
| Go 引擎调用失败数 | `/api/metrics` → `go_engine_calls_total{result="fallback"}` | 持续增长         |
| 引擎不可用事件    | `/api/metrics` → `engine_unavailable_total{reason}`         | 持续增长         |
| 数据引擎扫描耗时  | 后端日志 `[dataManageRoutes] /stats scanTickersStats 耗时`  | > 5000ms         |

> 指标名以 `packages/backend/src/utils/metrics.ts` 实际定义为准。`circuit_breaker_state` 为 Gauge（0=closed/1=open/2=halfOpen，label: `name`）；`go_engine_calls_total` 为 Counter（label: `result`，取值 `success`/`fallback`）；`engine_unavailable_total` 为 Counter（label: `reason`，记录 Go 引擎熔断/不可用事件，ADR-031 fail-closed 后引擎不可用即返回 503，不再降级到 Node.js）。

## 四、常见故障排查

### 故障 1：Go 引擎不可用（fail-closed 503）

**症状**：`/api/health` 返回 `engine.go: false`，计算端点返回 503 + Retry-After

**排查步骤**：

1. 检查 Go 引擎进程是否运行：`Get-Process go`
2. 检查端口 5002 是否监听：`netstat -ano | findstr 5002`
3. 尝试手动启动：`cd engine-go; go run ./cmd/server`
4. 查看构建错误：`cd engine-go; go build ./cmd/server 2>&1`
5. 检查后端日志中的 Go 引擎调用错误

**恢复**：修复构建错误后重启 Go 引擎，后端熔断器恢复后自动重新路由请求。

### 故障 2：数据引擎 /stats 接口慢

**症状**：`/api/data/manage/stats` 响应时间 > 5 秒

**排查步骤**：

1. 检查后端日志中 `scanTickersStats 耗时` 标记
2. 检查 `packages/backend/data/cache/stats_cache.json` 是否存在（缓存命中应 < 100ms）
3. 首次加载无缓存时返回 `{ scanning: true }` 是正常行为（后台异步扫描）
4. 如果持续慢，检查 `data/tickers/` 目录文件数量

**恢复**：等待后台扫描完成生成缓存，后续请求将从缓存读取。

### 故障 3：前端页面白屏

**症状**：访问页面显示空白

**排查步骤**：

1. 检查后端 API 是否运行：`curl http://localhost:5001/api/health`
2. 检查浏览器控制台错误
3. 检查前端构建产物：`npm run build`
4. 开发模式检查 Vite 服务器：`curl http://localhost:5175`

### 故障 4：Go 数据服务不可用

**症状**：数据获取失败，降级到本地 JSON 文件

**排查步骤**：

1. 检查 Go 服务进程：`Get-Process go`
2. 检查端口 5003：`netstat -ano | findstr 5003`
3. 手动启动：`cd data-fetcher; go run .`
4. 检查 `data/tickers/` 目录是否有缓存数据

### 故障 5：数据文件损坏/缓存不一致

**症状**：接口返回异常数据、NaN 值、日期缺失、或前端图表显示异常

**排查步骤**：

1. 检查具体 ticker 数据文件：`Get-Content data/tickers/<TICKER>.json | ConvertFrom-Json | Select-Object -First 5`
2. 检查缓存版本号：`Get-Content data/cache/.cache_version`
3. 检查统计缓存是否过期：`Get-Item packages/backend/data/cache/stats_cache.json | Select-Object LastWriteTime`
4. 对比数据库与文件数据一致性（PostgreSQL 可用时）：
   ```sql
   SELECT ticker, COUNT(*), MIN(date), MAX(date) FROM prices GROUP BY ticker ORDER BY ticker;
   ```
5. 检查 CPI/汇率文件完整性：`Get-Content data/market/cpi/us_cpi.json | ConvertFrom-Json | Measure-Object`

**恢复**：

- 清除统计缓存：`Remove-Item packages/backend/data/cache/stats_cache.json -ErrorAction SilentlyContinue`
- 重新生成元数据：`POST /api/v1/data/manage/regenerate-meta`
- 单个 ticker 重新获取：`POST /api/v1/data/manage/update/refetch`
- 全量重建：`POST /api/v1/data/manage/update/full`
- 从备份恢复数据文件：`Copy-Item -Path backup/tickers/* -Destination data/tickers/ -Recurse -Force`

### 故障 6：PostgreSQL 不可用

> 企业理由：PostgreSQL 是持久化存储的核心依赖，不可用时 API 层将无法写入/读取结构化数据，直接影响业务可用性。
> 权衡：引入熔断器和连接池中间件会增加少量延迟，但能避免级联故障导致全站 503。

**症状**：API 返回 503、日志 `[db] PostgreSQL 连接池发生未捕获错误`、healthCheck 失败

**排查步骤**：

1. **连接池耗尽**：查看 active/idle 连接数

   ```sql
   kubectl exec -it postgres-0 -- psql -U backtest -c \
     "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   ```

2. **慢查询定位**：找出长时间运行的活跃查询

   ```sql
   SELECT query, state, wait_event_type, wait_event,
          now()-query_start AS duration
   FROM pg_stat_activity
   WHERE state='active'
   ORDER BY duration DESC LIMIT 10;
   ```

3. **连接池配置**：检查 `DB_POOL_MAX`（默认 20）、`DB_STATEMENT_TIMEOUT_MS` 是否合理

**修复步骤**：

1. **连接池耗尽**：临时 kill idle 事务

   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state='idle in transaction'
     AND now()-query_start > interval '5 minutes';
   ```

2. **迁移失败回滚**：调用 rollbackSchema 回退到指定版本

   ```powershell
   kubectl exec -it api-pod -- node -e \
     "const {rollbackSchema,closeDb}=require('./dist/db/pool.js');rollbackSchema(0).then(closeDb)"
   ```

3. **磁盘满清理**：
   ```sql
   -- 检查数据库大小
   kubectl exec -it postgres-0 -- psql -U backtest -c \
     "SELECT pg_size_pretty(pg_database_size('backtest'));"
   ```
   ```sql
   -- 回收空间
   VACUUM FULL;
   ```
   ```powershell
   -- 检查 WAL 目录
   kubectl exec -it postgres-0 -- du -sh /var/lib/postgresql/data/pg_wal
   ```

**预防**：

- 配置 `statement_timeout` 防止慢查询占满连接
- 添加 PostgreSQL 熔断器（opossum），避免级联故障
- 引入 PgBouncer 作为外部连接池，控制最大连接数

## 五、部署指南

### 前置条件

- Node.js 20+
- Go 1.22+
- 数据文件已就位（`data/tickers/` 目录）

### 部署步骤

1. **拉取代码**

   ```powershell
   git pull origin main
   ```

2. **安装依赖**

   ```powershell
   npm ci
   cd engine-go; go build ./cmd/server; cd ..
   cd data-fetcher; go mod download; cd ..
   ```

3. **构建前端**

   ```powershell
   npm run build
   ```

4. **验证构建**

   ```powershell
   npm run check    # TypeScript 类型检查
   npm run lint     # ESLint 检查
   npm run test:unit  # 单元测试
   ```

5. **配置环境变量**

   ```powershell
   # 创建 .env 文件
   Copy-Item .env.example .env
   # 编辑 .env，设置：
   #   NODE_ENV=production
   #   ADMIN_API_KEY=<your-secret-key>
   #   CORS_ORIGINS=https://your-domain.com
   #   GO_ENGINE_URL=http://127.0.0.1:5004
   #   GO_DATA_SERVICE_URL=http://127.0.0.1:5003
   #   DATABASE_URL=postgresql://backtest:<password>@<host>:5432/backtest
   #   DB_POOL_MAX=20
   #   DB_STATEMENT_TIMEOUT_MS=30000
   ```

6. **初始化数据库 Schema**

   ```powershell
   # 部署 PostgreSQL 后，运行 initSchema 创建表结构
   node -e "const{initSchema,closeDb}=require('./dist/db/pool.js');initSchema().then(closeDb)"
   ```

7. **启动服务**（按顺序）

   ```powershell
   # 终端 1：Go 引擎
   cd engine-go; go run ./cmd/server

   # 终端 2：Go 数据服务
   cd data-fetcher; go run .

   # 终端 3：后端 API
   ```

NODE_ENV=production node --import tsx packages/backend/src/app.ts

````

8. **验证部署**
```powershell
curl http://localhost:5001/api/health
# 预期：{ success: true, data: { status: "ok", engine: { go: true } } }
````

### Docker 部署（可选）

```powershell
docker-compose up -d
```

> 注意：docker-compose.yml 存在但尚未经过完整验证。建议优先使用手动部署。

## 六、回滚流程

### 场景 1：代码回滚

```powershell
# 1. 停止所有服务
Get-Process -Name "node","go" -ErrorAction SilentlyContinue | Stop-Process

# 2. 回滚到上一个稳定版本
git log --oneline -5          # 查看最近提交
git checkout <stable-commit>  # 回滚到稳定版本

# 3. 重新构建
npm ci
npm run build
cd engine-go; go build ./cmd/server; cd ..

# 4. 重启服务（按部署指南步骤 6）
```

### 场景 2：Go 引擎不可用（fail-closed 模式）

Go 引擎是唯一的计算引擎（ADR-031），不可用时计算端点返回 503 + Retry-After。
不提供 Node.js 降级计算，确保结果一致性。

```powershell
# 验证 fail-closed 状态
curl http://localhost:5001/api/health
# 预期：{ status: "degraded", engine: { go: false } }
```

> 注意：Go 引擎不可用时所有回测/分析/优化/蒙特卡洛端点返回 503，需尽快修复。

### 场景 3：数据回滚

```powershell
# 数据文件通常在 data/tickers/ 目录，使用 git 回滚
git checkout HEAD~1 -- data/tickers/

# 或者从备份恢复
Copy-Item -Path backup/tickers/* -Destination data/tickers/ -Recurse -Force

# 删除统计缓存以强制重新扫描
Remove-Item packages/backend/data/cache/stats_cache.json -ErrorAction SilentlyContinue
```

## 七、环境变量参考

| 变量                      | 默认值                  | 说明                                                                             |
| ------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`           | 运行环境                                                                         |
| `API_PORT`                | `5001`                  | 后端 API 端口                                                                    |
| `GO_ENGINE_URL`           | `http://127.0.0.1:5004` | Go 引擎地址（替代已退役的 Rust/Node 引擎）                                       |
| `GO_ENGINE_TIMEOUT_MS`    | `5000`                  | Go 引擎调用超时（ms）                                                            |
| `GO_DATA_SERVICE_URL`     | `http://127.0.0.1:5003` | Go 数据服务地址                                                                  |
| `CORS_ORIGINS`            | `*`（允许所有）         | CORS 白名单（逗号分隔）                                                          |
| `DATABASE_URL`            | `""`                    | PostgreSQL 连接字符串（如 `postgresql://backtest:pass@localhost:5432/backtest`） |
| `DB_POOL_MAX`             | `20`                    | 连接池最大连接数                                                                 |
| `DB_POOL_MIN`             | `2`                     | 连接池最小空闲连接数                                                             |
| `DB_STATEMENT_TIMEOUT_MS` | `30000`                 | 查询超时毫秒数                                                                   |
| `JWT_PUBLIC_KEY`          | `""`                    | JWT 公钥（RS256 验证，生产必需）                                                 |
| `JWT_ISSUER`              | `backtest-platform`     | JWT 签发者                                                                       |

## 八、测试命令速查

| 命令                             | 说明                   |
| -------------------------------- | ---------------------- |
| `npm run check`                  | TypeScript 类型检查    |
| `npm run lint`                   | ESLint 检查            |
| `npm run test:unit`              | 单元测试（169 用例）   |
| `npm run test:e2e`               | E2E 测试（需后端运行） |
| `npm run build`                  | 构建前端               |
| `go test ./...`（engine-go/）    | Go 引擎测试            |
| `go test ./...`（data-fetcher/） | Go 数据服务测试        |

## 九、Escalation 路径

> 企业理由：明确的升级路径避免事故时找不到负责人，缩短 MTTR（平均恢复时间）。
> 权衡：层级越多响应越慢，3 层是 SRE 行业标准实践。

| 层级 | 角色               | 职责                                 | 响应时间 | 联系方式           |
| ---- | ------------------ | ------------------------------------ | -------- | ------------------ |
| L1   | 值班运维           | 告警确认、初步排查、执行已知修复方案 | 5 分钟   | 值班群 / PagerDuty |
| L2   | 后端开发           | 复杂问题排查、代码级修复、配置变更   | 15 分钟  | 开发群 / 电话      |
| L3   | 架构师 / Tech Lead | 架构级决策、跨团队协调、数据库迁移   | 30 分钟  | 紧急电话           |

**升级规则**：

- L1 在 15 分钟内无法解决 → 升级到 L2
- L2 在 30 分钟内无法解决 → 升级到 L3
- 任何 SEV0 事故 → 直接通知 L3

## 十、SLA / SLO 定义

> 企业理由：SLA/SLO 是服务可靠性的量化承诺，没有度量就无法改进。
> 权衡：过高的 SLO 目标会导致过度工程化，过低则失去用户信任。
> 当前目标基于回测平台的实际使用模式（非实时交易系统）设定。

| 指标     | SLO 目标 | 计算方式                        | 告警阈值 |
| -------- | -------- | ------------------------------- | -------- |
| 可用性   | 99.5%    | 成功请求 / 总请求（5 分钟窗口） | < 99.0%  |
| P95 延迟 | < 2s     | 请求响应时间 P95（5 分钟窗口）  | > 3s     |
| 错误率   | < 1%     | 5xx 响应 / 总响应（5 分钟窗口） | > 2%     |

**错误预算**：每月 0.5% 不可用时间 ≈ 3.6 小时。超出后冻结非紧急变更。

## 十一、事故分级

> 企业理由：统一的事故分级确保资源按优先级分配，避免小事故占用大资源或大事故响应不足。
> 权衡：分级是主观判断，需根据实际影响而非技术复杂度决定。

| 级别 | 定义           | 影响范围                       | 响应要求           | 示例                                           |
| ---- | -------------- | ------------------------------ | ------------------ | ---------------------------------------------- |
| SEV0 | 全面不可用     | 所有用户无法使用核心功能       | 立即响应，全员介入 | API 完全宕机、数据库损坏                       |
| SEV1 | 核心功能降级   | 大部分用户受影响，但有降级方案 | 15 分钟内响应      | Go 引擎不可用（503 fail-closed）、数据服务宕机 |
| SEV2 | 非核心功能异常 | 少部分用户受影响               | 1 小时内响应       | 搜索功能异常、缓存命中率下降                   |
| SEV3 | 轻微问题       | 几乎无用户影响                 | 下个工作日处理     | 日志格式错误、监控指标偏差                     |

## 十二、Burn Rate Alert 响应步骤

> 企业理由：Burn Rate 告警是 SLO 告警的最佳实践（Google SRE Workbook），
> 基于错误预算消耗速率而非绝对阈值，减少误报同时保证及时响应。
> 权衡：快速燃烧(Page)可能误报，慢速燃烧(Ticket)可能延迟发现。

### 快速燃烧（Critical/Page）

1. **确认告警**：查看 Slack/PagerDuty 通知
2. **查询 SLO**：`sum(rate(http_requests_total{status_code=~"5.."}[1h])) / sum(rate(http_requests_total[1h]))`
3. **定位问题路由**：`topk(5, sum by (route) (rate(http_requests_total{status_code=~"5.."}[1h])))`
4. **排查根因**：
   - 检查最近部署：`git log --oneline -5`
   - 检查数据库连接：`curl http://localhost:8081/api/data/health`
   - 检查外部服务：BaoStock/akshare 可用性
5. **缓解措施**：
   - 回滚部署：`kubectl rollout undo deployment/backtest-api`
   - 扩容：`kubectl scale deployment/backtest-api --replicas=3`
   - 熔断：临时禁用问题路由
6. **恢复确认**：错误率降至 <0.1%
7. **Postmortem**：24h 内完成

### 慢速燃烧（Warning/Ticket）

1. 创建 JIRA 工单
2. 在下一个 sprint 排期修复
3. 持续监控错误率趋势

## 十三、Postmortem 模板

> 企业理由：Postmortem 是从故障中学习的核心机制，无指责文化（blameless）是前提。
> 每次 SEV0/SEV1 事故必须在 48 小时内完成 Postmortem。
> 权衡：写 Postmortem 需要时间投入，但避免同类故障再次发生是更高 ROI。

```markdown
# Postmortem: [事故标题]

**日期**: YYYY-MM-DD
**级别**: SEV0/1/2/3
**影响时长**: X 小时 Y 分钟
**影响用户数**: 约 N 人
**负责人**: @name

## 事故时间线

| 时间  | 事件      |
| ----- | --------- |
| HH:MM | 告警触发  |
| HH:MM | L1 确认   |
| HH:MM | 升级到 L2 |
| HH:MM | 定位根因  |
| HH:MM | 修复部署  |
| HH:MM | 服务恢复  |

## 根因分析

[描述根本原因，而非表面现象]

## 影响评估

- 用户影响：[描述]
- 数据影响：[是否有数据丢失/不一致]
- 业务影响：[描述]

## 修复措施

| 措施       | 负责人 | 截止日期   | 状态     |
| ---------- | ------ | ---------- | -------- |
| [短期修复] | @name  | YYYY-MM-DD | ✅/⏳/❌ |
| [长期预防] | @name  | YYYY-MM-DD | ✅/⏳/❌ |

## 经验教训

1. [做得好的地方]
2. [需要改进的地方]
3. [幸运的因素（不应依赖）]
```
