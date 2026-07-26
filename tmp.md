# 回测平台企业级强化计划

## plan.md

---

## 目录

1. [总体策略与优先级框架](#1-总体策略与优先级框架)
2. [P0 — 生产可用性缺口修复](#2-p0--生产可用性缺口修复)
3. [P1 — 运营质量强化](#3-p1--运营质量强化)
4. [P2 — 长期可维护性改进](#4-p2--长期可维护性改进)
5. [P3 — 工程卫生清理](#5-p3--工程卫生清理)
6. [P4 — 探索性改进机会](#6-p4--探索性改进机会)
7. [里程碑与时间线](#7-里程碑与时间线)
8. [总 Checklist](#8-总-checklist)

---

## 1. 总体策略与优先级框架

### 背景约束

- **阶段**：内测，无付费用户，但按 GA（General Availability）标准建设
- **用户模型**：B2C，多租户，大量小租户
- **外部集成**：Stripe 计费已集成但未上线，无外部 SDK 计划
- **Go 引擎**：有多实例扩容计划
- **Worker**：已解耦但缺少部署配置（P0-3 成立）
- **K8s HPA**：已存在，配置完善
- **`child_process.spawn`**：管理操作，非请求路径

### 优先级定义

| 级别 | 定义                              | 时间目标             |
| ---- | --------------------------------- | -------------------- |
| P0   | 阻断 GA 或导致生产数据丢失/不可用 | 本迭代内完成         |
| P1   | 影响生产运营质量，付费用户受损    | 下一迭代完成         |
| P2   | 长期技术债，影响扩展性和可维护性  | 本季度完成           |
| P3   | 工程卫生，低成本高收益            | 滚动清理，随 PR 附带 |
| P4   | 探索性机会，需要调研后决策        | 下季度评估           |

---

## 2. P0 — 生产可用性缺口修复

### P0-1：BullMQ Worker 部署配置补全

**Spec**

Worker 进程（`packages/backend/src/queues/worker.ts`）已从业务逻辑上与 API 服务解耦，但完全缺少生产部署所需的基础设施配置。当前唯一的 webhook 重试 Worker 内嵌在 `server.ts` 中，这需要一并拆出。GA 前 Worker 必须是可独立管理的进程单元。

**目标状态**

```
API Server (Express)
    ↓ (BullMQ 入队)
Redis Queue
    ↓
Worker Process (独立 Deployment)
    ↓
Go Engine (HTTP)
    ↓
PostgreSQL
```

**Plan**

**Step 1：提取 webhook 重试 Worker 出 server.ts**

```typescript
// packages/backend/src/queues/webhookWorker.ts (新建)
// 将 server.ts 中内联的 webhook 重试逻辑移至此文件
// 与 backtestWorker.ts 并列
```

`server.ts` 中移除 webhook worker 的启动代码，改为在独立进程入口文件中启动。

**Step 2：创建统一 Worker 入口**

```typescript
// packages/backend/src/queues/workerEntrypoint.ts (新建)
// 作用: 启动所有 Worker (backtest + webhook)，
//       注册 SIGTERM/SIGINT 处理，优雅关闭

import { backtestWorker } from './worker';
import { webhookWorker } from './webhookWorker';

async function shutdown(signal: string) {
  console.log(`Received ${signal}, closing workers...`);
  await Promise.all([backtestWorker.close(), webhookWorker.close()]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**Step 3：添加 Dockerfile**

```dockerfile
# docker/worker/Dockerfile
FROM node:22-alpine AS base
WORKDIR /app

# 与 API Dockerfile 结构一致，复用 pnpm 安装层
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY packages/backend/src ./packages/backend/src
COPY packages/shared ./packages/shared

# 健康检查：Worker 写入 Redis heartbeat key
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('./packages/backend/src/queues/healthCheck.ts')"

CMD ["node", "--import", "tsx", "packages/backend/src/queues/workerEntrypoint.ts"]
```

**Step 4：添加 docker-compose 服务**

```yaml
# docker-compose.yml 新增
worker:
  build:
    context: .
    dockerfile: docker/worker/Dockerfile
  environment:
    - NODE_ENV=production
    - REDIS_URL=${REDIS_URL}
    - DATABASE_URL=${DATABASE_URL}
    - GO_ENGINE_URL=http://engine-go:5004
    - WORKER_CONCURRENCY=3
  depends_on:
    redis:
      condition: service_healthy
    postgres:
      condition: service_healthy
    engine-go:
      condition: service_healthy
  restart: unless-stopped
  deploy:
    replicas: 1 # Worker 单实例，BullMQ 天然防并发重复处理
```

**Step 5：添加 K8s Deployment**

```yaml
# k8s/base/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backtest-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backtest-worker
  template:
    spec:
      terminationGracePeriodSeconds: 60 # 给 Worker 足够时间完成当前任务
      containers:
        - name: worker
          image: backtest-worker:latest
          resources:
            requests:
              cpu: '500m'
              memory: '512Mi'
            limits:
              cpu: '1'
              memory: '1Gi'
          env:
            - name: WORKER_CONCURRENCY
              value: '3'
          livenessProbe:
            exec:
              command: ['node', '-e', "require('./healthCheck')"]
            initialDelaySeconds: 10
            periodSeconds: 30
```

**Step 6：添加 Worker 健康检查机制**

```typescript
// packages/backend/src/queues/healthCheck.ts
// Worker 每 15s 写入 Redis heartbeat key
// 健康检查读取该 key，超过 45s 未更新则判定为不健康
```

**Step 7：添加 package.json 脚本**

```json
// packages/backend/package.json
{
  "scripts": {
    "worker": "node --import tsx src/queues/workerEntrypoint.ts",
    "worker:dev": "node --watch --import tsx src/queues/workerEntrypoint.ts"
  }
}
```

**Checklist — P0-1**

- [ ] 创建 `packages/backend/src/queues/workerEntrypoint.ts`，统一启动所有 Worker
- [ ] 将 `server.ts` 中内联的 webhook 重试 Worker 提取到 `webhookWorker.ts`
- [ ] `server.ts` 中删除 webhook Worker 启动代码，验证 API 服务不再管理 Worker 生命周期
- [ ] 创建 `docker/worker/Dockerfile`，结构与 API Dockerfile 保持一致
- [ ] `docker-compose.yml` 添加 `worker` 服务，配置 `depends_on` 和 `restart: unless-stopped`
- [ ] 创建 `k8s/base/worker-deployment.yaml`
- [ ] 创建 `k8s/overlays/production/worker-patch.yaml`（调整资源限制）
- [ ] 创建 `k8s/overlays/dev/worker-patch.yaml`（单副本，低资源）
- [ ] 实现 `packages/backend/src/queues/healthCheck.ts`（Redis heartbeat）
- [ ] Worker Dockerfile 添加 HEALTHCHECK 指令
- [ ] `packages/backend/package.json` 添加 `worker` 和 `worker:dev` 脚本
- [ ] `.github/workflows/` 中 CI/CD 流水线包含 worker 镜像构建和推送
- [ ] 本地 `docker-compose up worker` 验证 Worker 正常启动和处理任务
- [ ] 验证 API 服务重启不影响 Worker 正在处理的任务
- [ ] 验证 Worker SIGTERM 后优雅等待当前任务完成再退出

---

### P0-2：Go 引擎多实例部署支持

**Spec**

`GO_ENGINE_URL` 硬编码单一地址（`http://127.0.0.1:15004`）是扩容瓶颈。配合已有的 HPA（min=2, max=10），引擎多实例部署需要在 Express API 侧实现客户端负载均衡或通过 K8s Service 进行服务发现。

**Plan**

**Step 1：修改引擎调用层，支持 K8s Service 发现**

在 K8s 环境下，`GO_ENGINE_URL` 应指向 K8s Service 而非单个 Pod IP，K8s Service 的 kube-proxy 提供 L4 负载均衡。这是最简单且可靠的方案。

```yaml
# k8s/base/engine-go-service.yaml — 确认已存在并正确配置
apiVersion: v1
kind: Service
metadata:
  name: engine-go
spec:
  selector:
    app: engine-go
  ports:
    - port: 5004
      targetPort: 5004
  type: ClusterIP # 内部服务，不暴露外部
```

`GO_ENGINE_URL` 在 K8s 中应设置为 `http://engine-go:5004`（Service DNS 名称），在 docker-compose 中为 `http://engine-go:5004`（容器名称）。

**Step 2：`engineClient.ts` 中加入请求级超时和重试**

```typescript
// packages/backend/src/utils/engineClient.ts 增强

// 现有：opossum 断路器
// 新增：
// 1. 每个请求独立超时（不依赖全局 10s 等待）
// 2. 幂等请求自动重试（GET 和所有计算请求天然幂等）
// 3. 重试时指数退避，最多 2 次重试

const ENGINE_REQUEST_TIMEOUT_MS = 25_000; // 单次请求超时
const ENGINE_MAX_RETRIES = 2;

async function callEngine<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt <= ENGINE_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENGINE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${config.goEngineUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engine-Auth': config.engineAuthToken,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && attempt < ENGINE_MAX_RETRIES) {
          await sleep(100 * Math.pow(2, attempt));
          continue;
        }
        throw new EngineError(response.status, await response.text());
      }

      return response.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt === ENGINE_MAX_RETRIES) throw err;
      await sleep(100 * Math.pow(2, attempt));
    }
  }
  throw new Error('Engine unreachable after retries');
}
```

**Step 3：废弃同步等待路径（`BACKTEST_SYNC_WAIT_MS`）**

同步路径让 HTTP 连接最多等待 10 秒，在引擎多实例场景下无法保证请求路由到同一实例。

```typescript
// application/backtest-service.ts
// 移除 BACKTEST_SYNC_WAIT_MS 逻辑
// 所有回测请求统一走 202 Accepted + jobId 模式
// 前端已有 useBacktestWs（WebSocket + 轮询降级）支持此模式

// 迁移策略：
// POST /api/v1/backtest/portfolio
//   → 立即返回 { jobId, status: 'queued' }
//   → 前端通过 WebSocket 订阅进度
//   → 降级：前端轮询 GET /api/v1/backtest/runs/:jobId
```

**Step 4：更新环境变量**

```bash
# .env.example 更新
# K8s 环境（通过 K8s Service）
GO_ENGINE_URL=http://engine-go:5004

# docker-compose 环境（通过容器名称）
GO_ENGINE_URL=http://engine-go:5004

# 本地开发（直连）
GO_ENGINE_URL=http://127.0.0.1:15004
```

**Checklist — P0-2**

- [ ] 确认 `k8s/base/engine-go-service.yaml` 存在且 selector 正确匹配 engine-go Pod
- [ ] K8s ConfigMap 中 `GO_ENGINE_URL` 设置为 `http://engine-go:5004`
- [ ] docker-compose 中 `GO_ENGINE_URL` 设置为 `http://engine-go:5004`（而非 127.0.0.1）
- [ ] `engineClient.ts` 中实现请求级超时（独立于 opossum 断路器）
- [ ] `engineClient.ts` 中实现幂等请求自动重试（指数退避，最多 2 次）
- [ ] 移除 `BACKTEST_SYNC_WAIT_MS` 配置项和相关代码
- [ ] `backtest-service.ts` 统一返回 202 + jobId，移除同步等待分支
- [ ] `.env.example` 更新注释说明不同环境下的 URL 格式
- [ ] 本地测试：启动 2 个 engine-go 实例，验证请求被分发到两个实例
- [ ] 压测验证：K8s 环境下 HPA 触发后，新实例能正常接收请求
- [ ] 验证断路器在所有引擎实例不可用时正确返回 503

---

### P0-3：Redis 模式生产断言

**Spec**

`redisClient.ts` 的 Sentinel + 单机双模式在生产环境存在配置错误时静默降级到单机模式的风险。会话、限流、BullMQ 队列、RBAC 缓存全部依赖 Redis，单机模式在生产环境是不可接受的高可用等级。

**Plan**

**Step 1：启动时断言 Redis 模式**

```typescript
// packages/backend/src/infrastructure/redisClient.ts 修改

function createRedisClient(config: RedisConfig): Redis | Cluster {
  const isSentinelConfigured = config.sentinelHosts && config.sentinelHosts.length >= 3;

  if (config.nodeEnv === 'production' && !isSentinelConfigured) {
    // 生产环境必须使用 Sentinel，否则启动失败
    // 不是 console.error，而是直接 throw 让进程崩溃
    throw new Error(
      'FATAL: Production environment requires Redis Sentinel ' +
        '(REDIS_SENTINEL_HOSTS must be configured with at least 3 nodes). ' +
        'Single-node Redis is not acceptable in production.',
    );
  }

  if (config.nodeEnv === 'staging' && !isSentinelConfigured) {
    // Staging 允许但发出警告
    logger.warn(
      { mode: 'standalone' },
      'WARN: Staging environment using standalone Redis. ' +
        'Consider switching to Sentinel for production parity.',
    );
  }

  if (isSentinelConfigured) {
    return new Redis({
      sentinels: parseSentinelHosts(config.sentinelHosts),
      name: config.sentinelMasterName ?? 'mymaster',
      password: config.redisPassword,
      enableReadyCheck: true,
      // Sentinel 专属配置
      sentinelRetryStrategy: (times: number) => Math.min(times * 100, 3000),
    });
  }

  // 单机模式：仅允许 development
  return new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
  });
}
```

**Step 2：添加 Redis 模式健康检查端点**

```typescript
// GET /api/health 响应中增加 Redis 模式信息
{
  "status": "ok",
  "redis": {
    "mode": "sentinel",  // "sentinel" | "standalone"
    "master": "mymaster",
    "sentinels": 3,
    "connected": true
  }
}
```

**Step 3：环境变量文档化**

```bash
# .env.example 生产区域注释
# --- Production Redis (Sentinel, 必填) ---
REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379,sentinel3:26379
REDIS_SENTINEL_MASTER_NAME=mymaster
REDIS_PASSWORD=<strong-password>

# --- Development Redis (Standalone, 仅开发) ---
# REDIS_HOST=localhost
# REDIS_PORT=6379
```

**Checklist — P0-3**

- [ ] `redisClient.ts` 在 `NODE_ENV=production` 且未配置 Sentinel 时启动即 throw（不是 warn）
- [ ] `redisClient.ts` 在 `NODE_ENV=staging` 且未配置 Sentinel 时输出 warn 但不 throw
- [ ] `NODE_ENV=development` 允许单机模式
- [ ] `/api/health` 响应中包含 Redis 模式信息
- [ ] `.env.example` 中生产/开发 Redis 配置分区注释
- [ ] K8s ConfigMap/Secret 中确认生产环境 `REDIS_SENTINEL_HOSTS` 已配置 3 节点
- [ ] 集成测试：验证缺少 Sentinel 配置时服务启动失败并输出明确错误信息
- [ ] 混沌测试：验证 Sentinel 主从切换期间服务降级行为符合预期（短暂 503 而非挂起）

---

### P0-4：配额执行 Redis 不可用时 fail-closed

**Spec**

`enforceQuota` 中间件当 Redis 不可用时的行为未明确定义。对于 B2C SaaS，配额放行（fail-open）意味着免费用户可以无限使用付费功能，是直接的商业损失。必须保证 fail-closed。

**Plan**

```typescript
// packages/backend/src/middleware/enforceQuota.ts 修改

export function enforceQuota(quotaKey: QuotaKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const redis = getAppRedis();
      const tenantId = req.tenantId!;
      const key = `quota:${tenantId}:${quotaKey}`;
      const limit = await getQuotaLimit(tenantId, quotaKey); // 从 DB 或缓存读取

      // 使用 Lua 脚本保证原子性，解决并发竞态
      const result = (await redis.eval(
        QUOTA_ATOMIC_SCRIPT, // INCR + EXPIRE + 比较，单次原子操作
        1,
        key,
        String(limit),
        String(QUOTA_WINDOW_SECONDS),
      )) as [number, number]; // [current, limit]

      const [current, effectiveLimit] = result;

      if (current > effectiveLimit) {
        return sendProblem(res, 429, 'QUOTA_EXCEEDED', {
          detail: `Quota exceeded: ${current}/${effectiveLimit} ${quotaKey}`,
          retryAfter: await redis.ttl(key),
        });
      }

      next();
    } catch (err) {
      // Redis 不可用时：fail-closed
      logger.error({ err, quotaKey }, 'Quota enforcement failed: Redis unavailable');

      // 记录到 Prometheus，方便告警
      quotaEnforcementFailures.inc({ quota_key: quotaKey, reason: 'redis_unavailable' });

      return sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', {
        detail: 'Service temporarily unavailable. Please try again later.',
        retryAfter: 30,
      });
    }
  };
}

// Lua 脚本：原子 INCR + EXPIRE + 比较
const QUOTA_ATOMIC_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return {current, tonumber(ARGV[1])}
`;
```

**Checklist — P0-4**

- [ ] `enforceQuota` 中间件 catch 块中明确 fail-closed（返回 503，不是 next()）
- [ ] 用 Lua 脚本替换 INCR + 判断分离操作，消除并发竞态
- [ ] 添加 Prometheus counter `quota_enforcement_failures_total`（label: quota_key, reason）
- [ ] 混沌测试：Redis 不可用时，配额受限用户无法绕过配额限制
- [ ] 混沌测试：Redis 不可用时，配额受限用户收到 503 而非 200
- [ ] 单元测试：Lua 脚本逻辑（mock Redis eval 返回值）
- [ ] 集成测试：高并发下同一租户同时发起 10 个请求，配额计数准确

---

## 3. P1 — 运营质量强化

### P1-1：战术配置持久化

**Spec**

`tactical-application-service.ts` 中战术配置存储在内存中，服务重启后丢失。即使目前处于内测阶段，这个设计在 GA 前必须解决，否则会在上线第一天造成用户数据丢失。

**Plan**

**Step 1：数据库迁移（迁移 026）**

```sql
-- migrations/026_tactical_configs.sql

CREATE TABLE tactical_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (char_length(description) <= 500),
  config      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tactical_configs_tenant_name_unique UNIQUE (tenant_id, name)
);

-- RLS 隔离
ALTER TABLE tactical_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tactical_configs_tenant_isolation ON tactical_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- 索引
CREATE INDEX tactical_configs_tenant_id_idx ON tactical_configs (tenant_id);
CREATE INDEX tactical_configs_user_id_idx ON tactical_configs (user_id);
CREATE INDEX tactical_configs_updated_at_idx ON tactical_configs (updated_at DESC);

-- 自动更新 updated_at
CREATE TRIGGER tactical_configs_updated_at
  BEFORE UPDATE ON tactical_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Step 2：Repository**

```typescript
// packages/backend/src/repositories/tacticalConfigRepository.ts
export interface TacticalConfigRepository {
  findByTenant(
    tenantId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<TacticalConfig[]>;
  findById(tenantId: string, id: string): Promise<TacticalConfig | null>;
  create(tenantId: string, userId: string, data: CreateTacticalConfigDto): Promise<TacticalConfig>;
  update(tenantId: string, id: string, data: UpdateTacticalConfigDto): Promise<TacticalConfig>;
  delete(tenantId: string, id: string): Promise<void>;
  count(tenantId: string): Promise<number>;
}
```

**Step 3：重构 `tactical-application-service.ts`**

移除内存存储，所有 CRUD 操作委托到 Repository。添加配额检查（每个租户最多 N 个战术配置）。

**Step 4：路由 CRUD 端点**

```
GET    /api/v1/tactical/configs          # 列表（分页）
POST   /api/v1/tactical/configs          # 创建
GET    /api/v1/tactical/configs/:id      # 详情
PUT    /api/v1/tactical/configs/:id      # 更新
DELETE /api/v1/tactical/configs/:id      # 删除
```

所有端点使用 `crudMiddleware(BACKTEST_RUN)` 权限链。

**Checklist — P1-1**

- [ ] 创建迁移 `migrations/026_tactical_configs.sql`
- [ ] 表包含：id, tenant_id, user_id, name, description, config (JSONB), created_at, updated_at
- [ ] RLS 策略正确（`tenant_id = current_setting('app.current_tenant_id')::uuid`）
- [ ] 创建 `tacticalConfigRepository.ts`，实现 findByTenant/findById/create/update/delete/count
- [ ] 重构 `tactical-application-service.ts` 使用 Repository，移除内存存储
- [ ] 添加租户配置数量上限配额检查（按计划等级区分）
- [ ] 路由文件添加 5 个 CRUD 端点
- [ ] Zod schema 验证配置内容结构
- [ ] 单元测试：Repository mock 测试
- [ ] 集成测试：CRUD 完整流程，包括 RLS 隔离验证
- [ ] 前端：战术配置页面接入持久化 API（替换内存状态）
- [ ] 前端：添加保存/加载配置 UI

---

### P1-2：`child_process.spawn` 替换为 HTTP API

**Spec**

当前数据批量更新通过 `spawn('go', ['run', './cmd/worker/main.go', 'update'])` 调用 Go CLI，存在以下问题：

1. `go run` 每次编译源码，生产环境不应使用（应使用预编译二进制）
2. 进程管理依赖 `taskkill`（Windows 命令），无法在 Linux/容器环境正常工作
3. 进度状态存在内存全局变量 `cachedStats`（违反架构约束）
4. 无法在 K8s 中水平扩展（状态不共享）

虽然这是管理操作（非请求路径），但在容器化环境中 `child_process.spawn` 是不可靠的进程管理方式。

**Plan**

**方案：将数据更新任务加入 BullMQ 队列**

```typescript
// 新增 Queue: data-update
// packages/backend/src/queues/dataUpdateQueue.ts

export const dataUpdateQueue = new Queue('data-update', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
});

// packages/backend/src/queues/dataUpdateWorker.ts
// Worker 调用 data-fetcher 的 HTTP API（而非 CLI）
// data-fetcher 已有 /api/data/batch-prices 等端点
```

```typescript
// dataManageRoutes.ts 修改
// 替换 startUpdate() (spawn) 为 dataUpdateQueue.add()
// 替换 getUpdateStatus() (内存) 为 queue.getJob(jobId).getState()
// 替换 stopUpdate() (taskkill) 为 job.remove() 或 worker.pause()
```

**Go data-fetcher 新增批量更新端点**

```
POST /api/data/admin/update-full    # 触发全量更新（异步）
POST /api/data/admin/update-inc     # 触发增量更新（异步）
GET  /api/data/admin/update-status  # 查询更新状态
```

数据更新进度存储在 Redis（BullMQ 内置），而非内存全局变量。

**Checklist — P1-2**

- [ ] 创建 `dataUpdateQueue.ts`（BullMQ Queue）
- [ ] 创建 `dataUpdateWorker.ts`（调用 data-fetcher HTTP API）
- [ ] `dataManageRoutes.ts` 中 `startUpdate()` 替换为 `dataUpdateQueue.add()`
- [ ] `getUpdateStatus()` 从 BullMQ Job 状态读取，移除内存 `cachedStats`
- [ ] `stopUpdate()` 改为 `job.remove()` 或设置 `shouldStop` 标志（而非 `taskkill`）
- [ ] data-fetcher 添加 `/api/data/admin/update-*` 管理端点（`DATA_MANAGE` 权限保护）
- [ ] 移除 `spawn('go', ['run', ...])` 调用
- [ ] 移除模块级 `let cachedStats` 全局变量
- [ ] `workerEntrypoint.ts` 中添加 `dataUpdateWorker` 启动
- [ ] 测试：管理员触发全量更新，验证任务入队，状态可查询
- [ ] 测试：任务取消，验证正常终止（非 taskkill）
- [ ] 测试：Linux 容器环境下（非 Windows）正常工作

---

### P1-3：错误监控完整性

**Spec**

前端 `catch (() => undefined)` 模式静默吞掉错误，导致监控系统存在盲区。这是一个系统性问题，需要：

1. 建立错误上报基础设施
2. 修复已知的静默吞错位置
3. 建立规范防止新的静默吞错引入

**Plan**

**Step 1：前端错误上报基础设施**

```typescript
// packages/frontend/src/utils/errorReporter.ts
// 统一错误上报：开发环境 console.error，生产环境发送到后端 /api/v1/errors

export function reportError(
  error: unknown,
  context: { component?: string; action?: string; [key: string]: unknown },
): void {
  const errorInfo = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  if (import.meta.env.DEV) {
    console.error('[ErrorReporter]', errorInfo);
    return;
  }

  // 生产：发送到后端，后端写入 Pino 日志（OTel 可采集）
  fetch('/api/v1/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(errorInfo),
    // 不需要等待响应，fire-and-forget
    keepalive: true,
  }).catch(() => {
    // 错误上报本身失败，不再递归
  });
}
```

**Step 2：修复 `useBacktestWs.ts` 静默吞错**

```typescript
// packages/frontend/src/hooks/useBacktestWs.ts

// 修改前
ws.onerror = () => {
  setConnected(false);
};

// 修改后
ws.onerror = (event) => {
  setConnected(false);
  reportError(new Error('WebSocket error'), {
    component: 'useBacktestWs',
    action: 'ws.onerror',
    jobId: currentJobId,
  });
  // 触发轮询降级
  startPollingFallback(currentJobId);
};

// 修改前（backtestWs.ts:115-116）
somePromise.catch(() => undefined);

// 修改后
somePromise.catch((err) => {
  reportError(err, { component: 'useBacktestWs', action: 'polling-fallback' });
});
```

**Step 3：后端错误接收端点**

```typescript
// packages/backend/src/routes/errorReportRoutes.ts
// POST /api/v1/errors
// 接收前端错误，写入 Pino 结构化日志
// 限流：10/min/IP（防滥用）
// 无需认证（认证失败时也需要上报错误）
```

**Step 4：ESLint 规则防止新的静默吞错**

```javascript
// .eslintrc 中添加
rules: {
  // 禁止空 catch 块
  'no-empty': ['error', { allowEmptyCatch: false }],
  // 自定义规则：catch 块中必须有 reportError 或 logger.error 调用
  // 使用 eslint-plugin-unicorn 的 no-useless-catch
  'unicorn/no-useless-catch': 'error',
}
```

**Checklist — P1-3**

- [ ] 创建 `packages/frontend/src/utils/errorReporter.ts`
- [ ] 创建后端 `POST /api/v1/errors` 端点（限流 10/min/IP，写入 Pino）
- [ ] 修复 `useBacktestWs.ts` 中 `catch (() => undefined)` 的所有实例
- [ ] 修复 `httpClient.ts:90` 中静默吞错
- [ ] 在 `ErrorBoundary` 组件中集成 `reportError`
- [ ] 添加 ESLint 规则禁止空 catch 块
- [ ] 验证：生产环境 WebSocket 断开时，后端日志中可以看到前端错误上报
- [ ] 验证：错误上报端点本身失败时不会引发无限递归

---

### P1-4：API 版本废弃策略

**Spec**

虽然目前无外部 SDK 计划，但 B2C SaaS 的 API Key 用户（其他开发者）会直接调用 API。建立版本废弃机制是 GA 前必要的承诺。

**Plan**

**Step 1：ADR-032（新增）— API 版本生命周期策略**

```markdown
# ADR-032: API 版本生命周期策略

## 状态：已接受

## 决策

- 当前版本 v1 至少维护至 v2 上线后 12 个月
- 废弃版本在 Response Header 中注明：
  Deprecation: true
  Sunset: <RFC 7231 日期>
  Link: </api/v2/...>; rel="successor-version"
- 废弃通知提前 90 天通过 Webhook 推送（事件类型：api.version.deprecated）
- 破坏性变更必须创建新版本（v2），不允许在 v1 中引入
```

**Step 2：废弃中间件**

```typescript
// packages/backend/src/middleware/apiDeprecation.ts
export function deprecatedRoute(sunsetDate: Date, successorPath?: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunsetDate.toUTCString());
    if (successorPath) {
      res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
    }
    next();
  };
}
```

**Step 3：Webhook 事件类型注册**

在 `webhookService.ts` 中注册 `api.version.deprecated` 事件类型，废弃公告时批量推送给所有有效 Webhook 端点。

**Checklist — P1-4**

- [ ] 创建 ADR-032（API 版本生命周期策略）
- [ ] 创建 `packages/backend/src/middleware/apiDeprecation.ts`
- [ ] 在路由注册时可选附加 `deprecatedRoute()` 中间件
- [ ] Webhook 事件类型列表中添加 `api.version.deprecated`
- [ ] `.env.example` 和文档中说明当前 API 版本承诺
- [ ] 契约测试中验证废弃响应头格式

---

## 4. P2 — 长期可维护性改进

### P2-1：契约测试实现替换

**Spec**

当前契约测试通过行级正则解析 OpenAPI YAML，脆弱且无法验证实际实现一致性。应替换为运行时验证方案。

**Plan**

**Step 1：引入 `express-openapi-validator`**

```typescript
// packages/backend/src/app.ts 中添加（非生产环境）
import * as OpenApiValidator from 'express-openapi-validator';

if (config.nodeEnv !== 'production') {
  app.use(
    OpenApiValidator.middleware({
      apiSpec: './docs/openapi.yaml',
      validateRequests: true, // 验证请求符合 spec
      validateResponses: true, // 验证响应符合 spec（开发时发现偏差）
      ignorePaths: /\/metrics|\/health|\/ready/,
    }),
  );
}
```

**Step 2：重写契约测试**

```typescript
// tests/contract/openapi.contract.test.ts 重写

// 使用 @apidevtools/swagger-parser 替代正则解析
import SwaggerParser from '@apidevtools/swagger-parser';

describe('OpenAPI Contract', () => {
  let api: OpenAPIV3.Document;

  beforeAll(async () => {
    // 真正的 YAML 解析，不是正则
    api = (await SwaggerParser.validate('./docs/openapi.yaml')) as OpenAPIV3.Document;
  });

  test('spec has required metadata', () => {
    expect(api.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(api.info.title).toBeTruthy();
    expect(Object.keys(api.paths)).toHaveLength.greaterThan(30);
  });

  test('all operations have security definitions', () => {
    for (const [path, item] of Object.entries(api.paths)) {
      for (const [method, op] of Object.entries(item ?? {})) {
        if (typeof op === 'object' && 'operationId' in op) {
          expect(op.security ?? api.security).toBeDefined();
        }
      }
    }
  });

  test('all 4xx responses have Problem Detail schema', () => {
    // 验证错误响应使用 RFC 7807 格式
  });

  // 集成：启动真实服务器，用生成的请求验证实际响应
});
```

**Checklist — P2-1**

- [ ] 安装 `express-openapi-validator` 和 `@apidevtools/swagger-parser`
- [ ] `app.ts` 中非生产环境启用请求/响应验证
- [ ] 重写 `tests/contract/openapi.contract.test.ts`（移除行级正则）
- [ ] 契约测试覆盖：spec 元数据、路径数量、操作安全定义、错误响应 schema
- [ ] CI 中运行契约测试，并在 spec 与实现不一致时失败
- [ ] `docs/openapi.yaml` 所有端点补全 request body 和 response schema

---

### P2-2：K8s 生产就绪配置审计

**Spec**

需要确认 K8s 配置包含所有生产就绪要素，根据回答补充缺失项。

**Plan**

以下是需要确认存在并补充的配置清单，按服务分类：

**Engine-go（计算密集型）**

```yaml
# k8s/base/engine-go-deployment.yaml 需要确认/添加

spec:
  template:
    spec:
      # 反亲和性：确保多副本不在同一节点
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                topologyKey: kubernetes.io/hostname
                labelSelector:
                  matchLabels:
                    app: engine-go

      # 安全上下文：非 root 运行
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false

      containers:
        - name: engine-go
          # 探针（启动探针对 Go 服务特别重要）
          startupProbe:
            httpGet:
              path: /api/engine/health
              port: 5004
            failureThreshold: 30
            periodSeconds: 2
          livenessProbe:
            httpGet:
              path: /api/engine/health
              port: 5004
            initialDelaySeconds: 0
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/engine/health
              port: 5004
            initialDelaySeconds: 0
            periodSeconds: 5
            failureThreshold: 2
```

```yaml
# k8s/base/engine-go-pdb.yaml（新建）
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: engine-go-pdb
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: engine-go
```

**API 服务**

```yaml
# k8s/base/api-pdb.yaml（新建）
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: api
```

**TopologySpreadConstraints（跨可用区分散）**

```yaml
# 在生产 overlay 中添加到 engine-go 和 api deployment
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app: engine-go
```

**Checklist — P2-2**

- [ ] 确认并补充 engine-go Deployment 的 startupProbe/livenessProbe/readinessProbe
- [ ] 确认并补充 api Deployment 的三种探针
- [ ] 确认并补充 data-fetcher Deployment 的三种探针
- [ ] 创建 `k8s/base/engine-go-pdb.yaml`（minAvailable: 1）
- [ ] 创建 `k8s/base/api-pdb.yaml`（minAvailable: 1）
- [ ] 创建 `k8s/base/worker-pdb.yaml`（maxUnavailable: 0，Worker 不能中断）
- [ ] 所有 Deployment 的 securityContext 配置 runAsNonRoot + readOnlyRootFilesystem
- [ ] 生产 overlay 中 engine-go 添加 podAntiAffinity
- [ ] 生产 overlay 中 engine-go 和 api 添加 topologySpreadConstraints（跨 AZ）
- [ ] 所有容器显式设置 resources.requests 和 resources.limits
- [ ] 验证：`kubectl get pdb -n production` 显示所有 PDB 健康

---

### P2-3：后端模块边界规划

**Spec**

`packages/backend/src` 的 512 个文件是单一包，随着功能增长编译速度会持续下降，且无法按模块独立部署。现阶段不需要实际拆分，但需要明确边界和触发条件。

**Plan**

**Step 1：ADR-033（新增）— 后端模块边界策略**

```markdown
# ADR-033: 后端模块化策略

## 状态：已接受

## 当前状态

packages/backend 是单一 Node.js 进程，内部按 DDD 分层。

## 逻辑边界（当前已存在，无需物理拆分）

- auth-module：认证/授权/用户管理（routes/auth, application/auth）
- backtest-module：核心回测（routes/backtest, application/backtest-service）
- billing-module：计费（routes/billing, application/billing）
- data-module：数据管理（routes/data, infrastructure/dataQuery）
- org-module：组织管理（routes/orgs）
- admin-module：平台管理（routes/admin）
- webhook-module：Webhook（routes/webhooks, application/webhookService）

## 拆分触发条件

当满足以下任意一条时，评估该模块独立部署：

1. 该模块的部署频率远高于其他模块（每周 > 5 次独立部署）
2. 该模块的 CPU/内存消耗导致其他模块延迟
3. 团队规模超过 10 人，多团队并行开发该模块
4. 该模块需要不同的扩容策略

## 技术准备

- 模块间通信：当前直接函数调用，拆分后改为 HTTP + BullMQ
- 共享状态：Redis（已有）
- 数据库：当前共享 PG，拆分后评估是否需要独立 Schema
```

**Step 2：添加模块间依赖检测（可选，但推荐）**

```javascript
// tools/check-module-boundaries.js
// 使用 dependency-cruiser 检测模块间的非法依赖
// 例如：billing 不应该直接导入 backtest 的 Repository
```

**Checklist — P2-3**

- [ ] 创建 ADR-033（后端模块边界策略）
- [ ] 文档中列出 7 个逻辑模块及其文件归属
- [ ] 定义拆分触发条件（量化指标）
- [ ] 可选：引入 dependency-cruiser 检测模块间非法依赖
- [ ] 可选：为每个逻辑模块创建 `index.ts` 作为公开 API 边界

---

### P2-4：Stripe Webhook 幂等性强化

**Spec**

Stripe Webhook 处理涉及财务操作（开通订阅、升级降级、取消），必须严格保证幂等性。现有的 `idempotencyKey` 中间件用于 `adminMiddleware`，但需要确认 Stripe Webhook 处理路径的幂等保护。

**Plan**

```typescript
// packages/backend/src/routes/billingRoutes.ts

// Stripe Webhook 处理中添加事件去重
app.post('/api/v1/billing/webhook', rawBody, async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, config.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed`);
  }

  // 幂等性：检查事件是否已处理
  const processed = await isStripeEventProcessed(event.id); // Redis SETNX
  if (processed) {
    logger.info(
      { eventId: event.id, type: event.type },
      'Stripe event already processed, skipping',
    );
    return res.json({ received: true });
  }

  try {
    await handleStripeEvent(event);
    await markStripeEventProcessed(event.id, 24 * 60 * 60); // 24h TTL
    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, 'Stripe event handling failed');
    // 返回 500 让 Stripe 重试
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

```typescript
// 不同环境使用不同的 Stripe Webhook Secret
// 通过 K8s Secret 区分 production/staging

// k8s/overlays/production/secrets-patch.yaml
// STRIPE_WEBHOOK_SECRET=whsec_production_xxx

// k8s/overlays/staging/secrets-patch.yaml
// STRIPE_WEBHOOK_SECRET=whsec_staging_xxx
```

**Checklist — P2-4**

- [ ] `billingRoutes.ts` 中 Stripe Webhook 处理添加事件去重（Redis SETNX + 24h TTL）
- [ ] 确认 production/staging/dev 使用不同的 Stripe Webhook Secret
- [ ] K8s Secret 中分环境配置 `STRIPE_WEBHOOK_SECRET`
- [ ] `.env.example` 中注释说明需要从 Stripe Dashboard 分环境获取 Webhook Secret
- [ ] 单元测试：同一 Stripe 事件处理两次，验证只执行一次业务逻辑
- [ ] 集成测试：Stripe 测试模式下，验证签名验证、事件处理、幂等保护

---

## 5. P3 — 工程卫生清理

### P3-1：前端调试代码清理

**Spec**

移除生产代码中的 `console.log`，统一使用 Logger 或移除。

**Plan**

```typescript
// packages/frontend/src/components/charts/GrowthChart.tsx
// 移除 Line 39 和 60 的 console.log

// 移除前
console.log('GrowthChart data:', data); // Line 39
console.log('GrowthChart formatted:', formatted); // Line 60

// 移除后（如果需要调试，使用条件判断）
if (import.meta.env.DEV) {
  // 仅在开发模式下输出，且通过 Vite tree-shaking 在生产构建中消除
}
```

前端其他 `console.error` 位置（6 个 admin 页面文件）替换为 `reportError()`（见 P1-3）。

**Checklist — P3-1**

- [ ] 移除 `GrowthChart.tsx:39` 的 `console.log`
- [ ] 移除 `GrowthChart.tsx:60` 的 `console.log`
- [ ] 6 个 admin 页面中的 `console.error` 替换为 `reportError()`
- [ ] `tracing.ts:109` 中 `console.warn` 替换为 `logger.warn`
- [ ] `validation.ts:115` 中 `console.warn` 替换为 `logger.warn`
- [ ] ESLint 添加 `no-console` 规则（`error` 级别，允许 `import.meta.env.DEV` 条件块内使用）
- [ ] 验证：生产构建（`vite build`）后产物不包含 `console.log`

---

### P3-2：TypeScript 类型安全强化

**Spec**

3 个页面的文件级 `no-explicit-any` 抑制和多处 `@ts-ignore` 影响类型安全。

**Plan**

```typescript
// packages/frontend/src/pages/BacktestPage.tsx
// 移除 /* eslint-disable @typescript-eslint/no-explicit-any */
// 为具体使用 any 的变量添加正确类型

// 常见情况：API 响应 any
// 修改前
const result: any = await apiFetch('/api/v1/backtest/portfolio');
// 修改后
const result: BacktestResult = await apiFetch<BacktestResult>('/api/v1/backtest/portfolio');

// 另一常见情况：事件处理器 any
// 修改前
const handleChange = (value: any) => { ... }
// 修改后
const handleChange = (value: string | number) => { ... }
```

对于 `vite.config.ts:72` 的 `@ts-ignore`：

```typescript
// 调查具体原因，大多数情况是 Vite 插件类型定义问题
// 解决方案：升级插件或添加正确的类型声明文件（.d.ts）
```

对于 `outboxKafkaConsumer.ts:89` 的 `@ts-ignore`：

```typescript
// 调查 Kafka 消息类型问题，使用 unknown + 类型守卫替代 @ts-ignore
```

**Checklist — P3-2**

- [ ] `BacktestPage.tsx` 移除文件级 `no-explicit-any`，为所有 `any` 添加具体类型
- [ ] `EfficientFrontierPage.tsx` 同上
- [ ] `AnalysisPage.tsx` 同上
- [ ] `vite.config.ts:72` 调查 `@ts-ignore` 原因，替换为正确类型或声明文件
- [ ] `outboxKafkaConsumer.ts:89` 调查 `@ts-ignore` 原因，替换为 unknown + 类型守卫
- [ ] `useLumpSumVsDCAState.ts:57` 替换 `any` 为具体类型
- [ ] `chart-theme.ts:101,104` 替换 `any` 为 `ChartTheme` 接口
- [ ] 启用 `strict: true` 的所有子选项（确认 `tsconfig.json` 中 `strict: true` 已开启）
- [ ] CI 中 `tsc --noEmit` 零错误

---

### P3-3：CSS 主题系统统一

**Spec**

`index.css`（暗色）和 `base.css`（亮色）两套 `:root` CSS 变量系统可能相互覆盖，是视觉 bug 的根源。

**Plan**

```css
/* 统一方案：单一 CSS 变量系统，通过 data-theme 属性切换 */

/* packages/frontend/src/styles/tokens.css (新建) */
:root {
  /* 语义化 token，不绑定到具体颜色值 */
  --color-background: var(--color-background-light);
  --color-foreground: var(--color-foreground-light);
  /* ... */
}

:root[data-theme='dark'] {
  --color-background: var(--color-background-dark);
  --color-foreground: var(--color-foreground-dark);
  /* ... */
}

/* 删除 index.css 和 base.css 中重复的 :root 定义 */
/* 保留两个文件，但只做 @import 引用 */
```

```typescript
// packages/frontend/src/hooks/useTheme.ts 修改
// 切换主题时修改 document.documentElement.dataset.theme
// 而不是添加/移除 class

function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}
```

**Checklist — P3-3**

- [ ] 分析 `index.css` 和 `base.css` 中所有 `:root` 变量定义，列出冲突点
- [ ] 创建 `packages/frontend/src/styles/tokens.css`（统一 CSS 变量系统）
- [ ] `index.css` 和 `base.css` 中的重复 `:root` 定义迁移到 `tokens.css`
- [ ] `useTheme.ts` 改用 `data-theme` 属性切换，而非 class
- [ ] 视觉回归测试：亮色/暗色模式下所有 27 个图表组件显示正常
- [ ] 验证：快速切换主题无闪烁（FOUC）

---

### P3-4：依赖版本统一

**Spec**

`typescript` 版本不一致（`~5.8.3` vs `^5.6.0`），包重复声明。

**Plan**

```json
// pnpm-workspace.yaml 或根 package.json 中使用 pnpm overrides 统一版本
{
  "pnpm": {
    "overrides": {
      "typescript": "~5.8.3",
      "vitest": "^3.0.0",
      "vite": "^6.3.5",
      "@testing-library/react": "^16.0.0"
    }
  }
}
```

```bash
# 执行后验证
pnpm dedupe
pnpm audit
```

**Checklist — P3-4**

- [ ] `pnpm-workspace.yaml` 中添加 `pnpm.overrides`，统一 `typescript` 到 `~5.8.3`
- [ ] 统一 `vitest`、`vite`、`@testing-library/react` 版本
- [ ] 执行 `pnpm dedupe` 清理重复依赖
- [ ] 执行 `pnpm audit`，修复高危漏洞
- [ ] 所有包 `pnpm build` 无错误
- [ ] 所有测试通过

---

### P3-5：全局请求超时中间件

**Spec**

Express 层缺少全局请求超时中间件，长时间请求（例如 Go 引擎无响应时）会无限占用连接。

**Plan**

```typescript
// packages/backend/src/middleware/requestTimeout.ts (新建)
import { Request, Response, NextFunction } from 'express';

export function requestTimeout(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn({ method: req.method, path: req.path, timeoutMs }, 'Request timeout');
        res.status(503).json({
          type: 'https://errors.backtest.io/timeout',
          title: 'Request Timeout',
          status: 503,
          detail: 'Request processing exceeded time limit',
        });
      }
    }, timeoutMs);

    // 清理：请求完成（正常或错误）时取消超时
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}
```

```typescript
// packages/backend/src/app.ts 中间件栈第 3 位（Prometheus 之后）插入
app.use(requestTimeout(30_000)); // 30s 全局上限

// 计算端点可以覆盖为更长超时
// 通过 Go 引擎端点本身的 90s 超时控制，全局 30s 针对非计算端点
```

**Checklist — P3-5**

- [ ] 创建 `packages/backend/src/middleware/requestTimeout.ts`
- [ ] `app.ts` 中间件栈中插入全局 30s 超时（在第 3 位）
- [ ] 计算端点通过路由级覆盖延长超时（或依赖 Go 引擎端点的 90s 超时）
- [ ] 超时时输出 Pino warn 日志（含 method/path/timeoutMs）
- [ ] 超时时返回 503 Problem Detail（不是 408）
- [ ] 单元测试：请求超过 30s 后收到 503
- [ ] 验证：`res.on('finish')` 正确清理 timeout，无内存泄漏

---

## 6. P4 — 探索性改进机会

以下为调研性任务，需要在执行前完成 PoC 或调研报告后再决策。

### P4-1：Go 引擎 gRPC 接口探索

**背景**

当前 Go 引擎通过 HTTP JSON 与 Express API 通信，数据量大时序列化/反序列化开销显著（单次回测请求体可能包含数十年的日度价格数据）。

**探索问题**

1. 当前最大请求体大小是多少？HTTP JSON 序列化耗时占回测总时间比例是多少？
2. gRPC + Protobuf 是否能显著降低延迟（预期：大数据集 30-50% 的序列化优化）？
3. 引入 gRPC 的维护成本（protobuf 定义同步、Go + TypeScript 双端代码生成）是否合理？

**调研任务**

- [ ] 在生产负载下测量 HTTP JSON 序列化/反序列化耗时（添加 OTel span）
- [ ] 选取最重的一个端点（efficient-frontier 或 monte-carlo）做 gRPC PoC
- [ ] 对比 HTTP JSON vs gRPC+Protobuf 的延迟和吞吐量
- [ ] 评估 protobuf schema 与 TypeScript 类型系统的同步维护成本
- [ ] 输出：调研报告 + 是否推进的决策建议

---

### P4-2：前端状态管理架构评估

**背景**

当前使用 Zustand（5 个 Slice）管理状态，但 `useBacktestWs`（408 行，7 个 useCallback）的复杂度提示状态管理可能已达边界。同时，部分工具页面直接使用 `useAsyncAction` 而非 `useComputeTool`，缺乏一致性。

**探索问题**

1. 20 个工具页面中，哪些页面的状态是完全局部的（无需 Zustand）？
2. `useBacktestWs` 的复杂度能否通过状态机（XState/Zag）降低？
3. 服务端状态（API 数据）是否值得引入 TanStack Query（缓存、重试、同步）？

**调研任务**

- [ ] 绘制 20 个工具页面的状态依赖图（哪些状态在页面间共享）
- [ ] 评估 `useBacktestWs` 用 XState 状态机重写的可行性（PoC）
- [ ] 评估 TanStack Query 替代当前 `useAsyncAction` + `useComputeTool` 的成本/收益
- [ ] 输出：状态管理架构评估报告

---

### P4-3：TimescaleDB 连续聚合扩展

**背景**

当前已有月度 CAGG（连续聚合）。对于 B2C 回测平台，用户常用的时间范围查询（YTD/1Y/5Y/10Y/ALL）可以通过预计算聚合显著降低查询延迟。

**探索问题**

1. 当前价格数据查询（`GetPriceData()`）的 P50/P95 延迟是多少？
2. 日度聚合、周度聚合是否能覆盖 80% 的查询场景？
3. CAGG 的存储开销是否在可接受范围？

**调研任务**

- [ ] 查询 Prometheus 中 `data_fetch_duration_*` 指标，分析当前数据查询延迟分布
- [ ] 分析用户实际查询的时间范围分布（从审计日志或 OTel）
- [ ] 设计日度/周度 CAGG schema（迁移 027）
- [ ] 压测对比：有/无 CAGG 的查询延迟
- [ ] 输出：迁移方案或放弃决策

---

### P4-4：多区域部署架构评估

**背景**

B2C 平台面向中国和全球用户（中英双语），中国大陆用户访问海外服务延迟高。

**探索问题**

1. 用户地理分布是什么？中国大陆用户占比是多少？
2. 数据合规：A 股历史数据是否有出境限制？
3. 多区域部署的最小成本方案（CDN 静态资源 + 区域 API + 共享数据库 vs 完全独立部署）？

**调研任务**

- [ ] 分析当前用户地理分布（从 Nginx/APISIX 访问日志）
- [ ] 法律咨询：A 股数据跨境传输合规性
- [ ] 评估 Cloudflare Workers / CDN 方案用于静态资源加速
- [ ] 评估数据库写入中心化 + 读副本区域化的可行性
- [ ] 输出：多区域部署架构调研报告

---

### P4-5：WebSocket 服务独立化

**背景**

当前 WebSocket 服务（`services/WebSocket 服务`）在 Express 进程中，但 WebSocket 长连接的资源消耗（内存、连接数）与 HTTP 请求处理的特性不同。当用户数增长时，WebSocket 连接可能成为 Express 进程的瓶颈。

**探索问题**

1. 当前 WebSocket 连接是否有清理机制（用户断开后）？
2. 当 Express 进程重启时，所有 WebSocket 连接断开，前端的轮询降级是否能无缝接管？
3. 独立的 WebSocket 服务（如 Socket.io 服务器 + Redis adapter）是否值得在 GA 前引入？

**调研任务**

- [ ] 审查 `services/` 中 WebSocket 服务的连接生命周期管理
- [ ] 压测：10K 并发 WebSocket 连接时 Express 进程的内存占用
- [ ] 评估 Socket.io + Redis adapter 方案（支持跨 Express 实例的连接共享）
- [ ] 评估 `useBacktestWs` 轮询降级在 Express 重启后的恢复时间
- [ ] 输出：WebSocket 架构评估报告

---

## 7. 里程碑与时间线

```
Week 1-2 (本迭代)
├── P0-1: Worker 部署配置补全
├── P0-2: Go 引擎多实例支持（K8s Service + 废弃同步路径）
├── P0-3: Redis 模式生产断言
└── P0-4: 配额执行 fail-closed + Lua 原子操作

Week 3-4 (下一迭代)
├── P1-1: 战术配置持久化（迁移 026 + Repository + CRUD API）
├── P1-2: child_process.spawn 替换为 BullMQ
├── P1-3: 错误监控基础设施
└── P1-4: API 版本废弃策略（ADR）

Month 2
├── P2-1: 契约测试实现替换
├── P2-2: K8s 生产就绪配置审计（PDB/探针/SecurityContext）
├── P2-3: 后端模块边界 ADR
└── P2-4: Stripe Webhook 幂等性强化

Month 2-3 (滚动清理，随 PR 附带)
├── P3-1: console.log 清理
├── P3-2: TypeScript 类型安全强化
├── P3-3: CSS 主题系统统一
├── P3-4: 依赖版本统一
└── P3-5: 全局请求超时中间件

Month 3-4 (调研，不阻塞 GA)
├── P4-1: gRPC 探索
├── P4-2: 前端状态管理评估
├── P4-3: TimescaleDB CAGG 扩展
├── P4-4: 多区域部署评估
└── P4-5: WebSocket 独立化评估
```

---

## 8. 总 Checklist

### P0 — 本迭代完成（阻断 GA）

**P0-1 Worker 部署**

- [ ] 创建 `packages/backend/src/queues/workerEntrypoint.ts`
- [ ] 提取 webhook Worker 到 `webhookWorker.ts`
- [ ] `server.ts` 移除 webhook Worker 启动代码
- [ ] 创建 `docker/worker/Dockerfile`
- [ ] `docker-compose.yml` 添加 worker 服务
- [ ] 创建 `k8s/base/worker-deployment.yaml`
- [ ] 创建生产/开发 K8s overlay patch
- [ ] 实现 Worker Redis heartbeat 健康检查
- [ ] `package.json` 添加 `worker` / `worker:dev` 脚本
- [ ] CI/CD 流水线包含 worker 镜像构建
- [ ] 验证 Worker 优雅关闭（SIGTERM）

**P0-2 引擎多实例**

- [ ] 确认 `k8s/base/engine-go-service.yaml` 正确配置
- [ ] K8s/docker-compose 中 `GO_ENGINE_URL` 指向 Service 而非 IP
- [ ] `engineClient.ts` 实现请求级超时和重试
- [ ] 移除 `BACKTEST_SYNC_WAIT_MS`，统一走 202 异步
- [ ] `.env.example` 更新

**P0-3 Redis 断言**

- [ ] 生产环境未配置 Sentinel 时启动即 throw
- [ ] Staging 环境输出 warn
- [ ] `/api/health` 包含 Redis 模式信息
- [ ] K8s Secret 确认生产 Sentinel 配置

**P0-4 配额 fail-closed**

- [ ] `enforceQuota` catch 块返回 503（不是 next()）
- [ ] Lua 原子脚本替换 INCR + 分离判断
- [ ] Prometheus counter `quota_enforcement_failures_total`
- [ ] 混沌测试验证 fail-closed 行为

### P1 — 下一迭代完成

**P1-1 战术配置持久化**

- [ ] 创建迁移 `026_tactical_configs.sql`（含 RLS）
- [ ] 创建 `tacticalConfigRepository.ts`
- [ ] 重构 `tactical-application-service.ts`
- [ ] 添加 5 个 CRUD 路由端点
- [ ] 前端接入持久化 API

**P1-2 spawn 替换**

- [ ] 创建 `dataUpdateQueue.ts` 和 `dataUpdateWorker.ts`
- [ ] `dataManageRoutes.ts` 替换 spawn 调用
- [ ] data-fetcher 添加管理端点
- [ ] 移除 `cachedStats` 全局变量

**P1-3 错误监控**

- [ ] 创建前端 `errorReporter.ts`
- [ ] 创建后端 `POST /api/v1/errors` 端点
- [ ] 修复 `useBacktestWs.ts` 静默吞错
- [ ] ESLint 禁止空 catch 块

**P1-4 API 版本策略**

- [ ] 创建 ADR-032
- [ ] 创建 `apiDeprecation.ts` 中间件
- [ ] 注册 `api.version.deprecated` Webhook 事件类型

### P2 — 本季度完成

**P2-1 契约测试**

- [ ] 引入 `express-openapi-validator` 和 `swagger-parser`
- [ ] 重写契约测试

**P2-2 K8s 审计**

- [ ] 所有服务添加三种探针
- [ ] 创建 engine-go/api/worker PDB
- [ ] 配置 SecurityContext（runAsNonRoot）
- [ ] 生产环境添加 podAntiAffinity 和 topologySpreadConstraints

**P2-3 模块边界**

- [ ] 创建 ADR-033

**P2-4 Stripe 幂等**

- [ ] Webhook 处理添加事件去重
- [ ] 分环境 Webhook Secret

### P3 — 滚动清理

- [ ] 移除 `GrowthChart.tsx` console.log
- [ ] 6 个 admin 页面 console.error → reportError
- [ ] 3 个页面移除文件级 no-explicit-any
- [ ] 清理 @ts-ignore（vite.config.ts / outboxKafkaConsumer.ts）
- [ ] 统一 CSS 主题变量系统
- [ ] pnpm overrides 统一依赖版本
- [ ] 添加全局 30s 请求超时中间件
- [ ] ESLint 添加 no-console 规则

### P4 — 调研任务（不阻塞 GA）

- [ ] gRPC PoC 调研报告
- [ ] 前端状态管理架构评估
- [ ] TimescaleDB CAGG 扩展评估
- [ ] 多区域部署架构调研
- [ ] WebSocket 独立化评估

---

_文档版本：1.0 | 生成日期：2026-07-26 | 下次审查：本迭代结束_
