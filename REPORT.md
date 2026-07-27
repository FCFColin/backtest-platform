# 回测平台 (Backtest Platform) — 全量代码库审核报告

> 生成日期: 2026-07-26 | 总代码量: ~171,389 行 (源文件) | 包管理器: pnpm 11 + Turborepo 2

---

## 目录

1. [技术栈总览](#1-技术栈总览)
2. [架构拓扑](#2-架构拓扑)
3. [代码量分布 (LOC)](#3-代码量分布-loc)
4. [包结构详解](#4-包结构详解)
5. [测试覆盖率与分布](#5-测试覆盖率与分布)
6. [已实现功能清单](#6-已实现功能清单)
7. [关键文件/类/函数/模块](#7-关键文件类函数模块)
8. [关键源代码分析](#8-关键源代码分析)
9. [确认问题清单](#9-确认问题清单)
10. [疑似问题清单](#10-疑似问题清单)
11. [改进建议](#11-改进建议)

---

## 1. 技术栈总览

| 层级             | 技术                                                 | 版本/说明                                 |
| ---------------- | ---------------------------------------------------- | ----------------------------------------- |
| **前端**         | React 18 + TypeScript 5.8 + Vite 6                   | SPA, port 15173                           |
| **前端样式**     | Tailwind CSS 3 + Radix UI + class-variance-authority | 组件库 + 设计系统                         |
| **前端状态**     | Zustand 5                                            | 4 个 slice 组合                           |
| **前端图表**     | Recharts 2 + 手写 SVG                                | 增长曲线/热力图/饼图等                    |
| **前端路由**     | react-router-dom 7                                   | 5 组路由 (Tool/Public/Auth/Account/Admin) |
| **前端国际化**   | i18next 26 + react-i18next 17                        | 中/英双语                                 |
| **后端 API**     | Express 4 + TypeScript (ESM)                         | port 15001                                |
| **后端运行时**   | tsx / esbuild                                        | 开发/生产                                 |
| **后端队列**     | BullMQ 5 + Redis                                     | 异步任务                                  |
| **后端验证**     | Zod 4                                                | 运行时 schema 验证                        |
| **后端 OpenAPI** | zod-to-openapi + swagger-ui-express                  | API 文档                                  |
| **后端可观测**   | Pino + OpenTelemetry + prom-client                   | 日志/链路/指标                            |
| **后端限流**     | express-rate-limit + rate-limit-redis                | 多级限流                                  |
| **后端熔断**     | opossum 8                                            | 数据库/服务熔断                           |
| **计算引擎**     | Go 1.26 + Gin + gonum                                | port 15004, 唯一引擎 (ADR-031)            |
| **数据服务**     | Go 1.26 + Gin + pgx                                  | port 15003                                |
| **Go 共享库**    | go-shared (otel/日志/中间件)                         | 内部包                                    |
| **数据库**       | PostgreSQL + TimescaleDB                             | 主存储 (ADR-007)                          |
| **缓存/会话**    | Redis 7 (Sentinel 高可用)                            | 缓存 + 会话 + 队列 (ADR-018/045)          |
| **身份认证**     | JWT (HS256/RS256) + RBAC (3 角色 × 7 权限)           | (ADR-017)                                 |
| **多租户**       | PostgreSQL RLS + 租户上下文                          | (ADR-032)                                 |
| **计费**         | Stripe (Checkout + Billing Portal)                   | (ADR-036)                                 |
| **API 网关**     | Apache APISIX                                        | K8s 部署                                  |
| **消息**         | Kafka + Debezium CDC                                 | 变更数据捕获                              |
| **监控**         | Prometheus + Grafana + Alertmanager                  | 完整监控栈                                |
| **容器**         | Docker Compose (19 服务)                             | 开发环境                                  |
| **编排**         | Kubernetes (k8s/ 目录)                               | 生产部署                                  |
| **CI/CD**        | GitHub Actions                                       | CI 流程                                   |
| **测试**         | Vitest 3 + Playwright 1.61 + k6                      | 单元/集成/契约/混沌/属性/e2e/负载         |

---

## 2. 架构拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React SPA)                      │
│                      port 15173 / 80 (prod)                      │
│           Vite 6 + Tailwind + Zustand + Recharts + i18n          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP /api/*
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express API (TypeScript ESM)                  │
│                         port 15001 / 5001                        │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Routes  │  │ Application  │  │  Domain    │  │ Middleware │  │
│  │  (27个)  │──│   Service    │──│ Aggregates │  │(JWT/RBAC/ │  │
│  └──────────┘  └──────┬───────┘  │  + Events  │  │ Audit/...) │  │
│                       │           └────────────┘  └───────────┘  │
│                       ▼                                          │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              Infrastructure Layer                          │   │
│  │  DataFacade → DataQuery → DataCache → Redis                │   │
│  │  Outbox (LISTEN/NOTIFY | Kafka CDC) → Webhook              │   │
│  │  BullMQ Queues → Worker (独立进程)                          │   │
│  │  API Key + Platform Admin Bootstrap                        │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────┬────────────────────────────┬──────────────────────────────┘
       │ callGoEngine()            │ callGoDataService()
       ▼                            ▼
┌──────────────────┐    ┌──────────────────────────────┐
│  Go Engine       │    │  Go Data Service              │
│  gin + gonum     │    │  gin + pgx                    │
│  port 15004/5004 │    │  port 15003/5003              │
│                  │    │                               │
│  Backtest        │    │  PostgreSQL (primary)         │
│  Monte Carlo     │    │  Provider Degradation Chain:  │
│  Optimizer       │    │  yfinance → finnhub →         │
│  EfficientFront  │    │  twelvedata → akshare         │
│  Analysis        │    │  + BaoStock (A股)             │
│  Statistics      │    │                               │
│  Signal          │    │  API: /api/data/price/        │
│  PCA             │    │  /api/data/search             │
│  LETF Slippage   │    │  /api/data/validate           │
│  Goal Optimizer  │    │  /api/baostock/*              │
│  Tactical        │    │                               │
│  Factor Regress  │    └──────────────┬────────────────┘
│  Calculators     │                   │
│  Grid Search     │                   ▼
└──────────────────┘          ┌──────────────────┐
                              │  PostgreSQL      │
                              │  + TimescaleDB   │
                              │  27 migrations   │
                              │  RLS (ADR-032)   │
                              └──────────────────┘
```

### 服务端口分配

| 服务            | 开发端口 | 容器端口 | 协议      |
| --------------- | -------- | -------- | --------- |
| Frontend (Vite) | 15173    | 80       | HTTP      |
| Express API     | 15001    | 5001     | HTTP + WS |
| Go Engine       | 15004    | 5004     | HTTP      |
| Go Data Service | 15003    | 5003     | HTTP      |
| PostgreSQL      | 15442    | 5432     | TCP       |
| Redis           | 16381    | 6379     | TCP       |
| BullMQ Worker   | -        | -        | 内部      |
| Prometheus      | 9090     | 9090     | HTTP      |
| Grafana         | 3000     | 3000     | HTTP      |
| Kafka           | 9092     | 9092     | TCP       |
| APISIX          | 9080     | 9080     | HTTP      |

### 退化链 (Degradation Chain)

```
引擎 (Go Engine):
  可用 → Go 计算结果
  不可用 → 503 + Retry-After (ADR-031, 永不回退到 Node 计算)

数据 (Data Service):
  PostgreSQL 可用 → 查询 DB
  DB 不可用 / 数据缺失 → Go Data Service 实时拉取 (yfinance → finnhub → ...)
  全部失败 → degraded=true, degradedWarning 返回前端
```

---

## 3. 代码量分布 (LOC)

### 3.1 按文件类型

| 扩展名       | 行数        | 文件数    | 占比     |
| ------------ | ----------- | --------- | -------- |
| `.ts`        | 103,718     | 726       | 60.5%    |
| `.tsx`       | 29,038      | 210       | 16.9%    |
| `.go`        | 16,340      | 109       | 9.5%     |
| `.json`      | 19,854      | 34        | 11.6%    |
| `.md`        | 9,595       | 93        | 5.6%     |
| `.yml/.yaml` | 6,918       | 22        | 4.0%     |
| `.sql`       | 1,504       | 57        | 0.9%     |
| `.css`       | 1,127       | 8         | 0.7%     |
| `.sh/.ps1`   | 1,947       | 42        | 1.1%     |
| 其他         | 908         | 29        | 0.5%     |
| **总计**     | **171,389** | **1,178** | **100%** |

### 3.2 按顶层目录

| 目录            | 行数   | 语言      | 占比  |
| --------------- | ------ | --------- | ----- |
| `packages/`     | 72,318 | TS/TSX/Go | 42.2% |
| `tests/`        | 42,966 | TS/TSX    | 25.1% |
| `public/`       | 13,103 | JSON      | 7.6%  |
| `docs/`         | 11,104 | MD/YAML   | 6.5%  |
| `engine-go/`    | 10,797 | Go        | 6.3%  |
| `data-fetcher/` | 5,577  | Go        | 3.3%  |
| `k8s/`          | 3,049  | YAML      | 1.8%  |
| `migrations/`   | 1,474  | SQL       | 0.9%  |
| 其他            | 17,511 | 混合      | 10.2% |

### 3.3 packages/ 子包分布

| 包                    | 行数   | 文件数 | 语言       |
| --------------------- | ------ | ------ | ---------- |
| `packages/frontend`   | 44,984 | ~300   | TSX/TS/CSS |
| `packages/backend`    | 24,833 | ~200   | TS         |
| `packages/api-client` | 1,161  | ~15    | TS         |
| `packages/shared`     | 1,086  | ~15    | TS         |
| `packages/go-shared`  | 254    | ~5     | Go         |

### 3.4 Go 服务分布

| 服务                    | 行数   | 文件数 |
| ----------------------- | ------ | ------ |
| engine-go (核心引擎)    | 10,744 | 68     |
| data-fetcher (数据服务) | 5,342  | 34     |
| go-shared (共享库)      | 254    | 5      |

### 3.5 测试分布

| 测试类型          | 行数   | 文件数 | 占比  |
| ----------------- | ------ | ------ | ----- |
| Unit (TS)         | 35,500 | 173    | 82.6% |
| Integration (TS)  | 2,953  | 20     | 6.9%  |
| Helpers (TS)      | 2,341  | 20     | 5.4%  |
| E2E (TS)          | 636    | 15     | 1.5%  |
| Chaos (TS)        | 567    | 6      | 1.3%  |
| Load (JS)         | 559    | 7      | 1.3%  |
| Property (TS)     | 229    | 2      | 0.5%  |
| Go (engine-go)    | ~3,100 | 14     | -     |
| Go (data-fetcher) | ~1,800 | 11     | -     |

---

## 4. 包结构详解

### 4.1 `packages/backend/` — Express API 服务器 (24,833 行)

```
src/
├── server.ts                    # 入口：优雅关闭、领域事件注册、Outbox 启动
├── app.ts                       # Express 装配：43 个中间件、27 个路由组
├── tracing.ts                   # OTel 链路追踪初始化
├── config/                      # 12 文件：env, index, configObject, validation
│   ├── env.ts                   #   .env 加载、CORS/JWT 算法解析
│   ├── index.ts                 #   薄重导出层
│   ├── configObject.ts          #   合成配置对象
│   ├── validation.ts            #   启动时配置校验
│   ├── serverConfig.ts          #   服务器配置
│   ├── databaseConfig.ts        #   数据库配置
│   ├── engineConfig.ts          #   引擎配置（含 auth token）
│   ├── authConfig.ts            #   认证配置（含 JWT secret）
│   ├── integrationsConfig.ts    #   集成配置
│   ├── featureFlags.ts          #   功能开关
│   ├── planLimits.ts            #   套餐限制
│   └── assertNoDefaultSecrets.ts # 生产环境密钥校验
├── db/                          # 6 文件：连接池、迁移、宏观数据、市场统计
│   ├── pool.ts                  #   PostgreSQL 连接池 (主 + 只读副本)
│   ├── migrations.ts            #   迁移执行器
│   ├── macroData.ts             #   宏观数据查询
│   ├── marketStats.ts           #   市场统计数据
│   ├── marketStatsHelpers.ts    #   统计助手
│   └── marketStorageStats.ts    #   存储统计
├── domain/                      # DDD 领域层
│   ├── aggregates/
│   │   ├── portfolio.ts         #   Portfolio 聚合根
│   │   └── run.ts               #   Run 聚合根 (状态机: queued→running→completed/failed)
│   ├── events/
│   │   ├── EventDispatcher.ts   #   领域事件分发器
│   │   ├── runEvents.ts         #   Run 事件定义
│   │   └── index.ts             #   导出
│   ├── services/
│   │   ├── grid-search.ts       #   网格搜索领域服务
│   │   └── optimizer-domain.ts  #   优化器领域服务
│   ├── value-objects/
│   │   ├── ticker.ts            #   Ticker 值对象
│   │   └── weight.ts            #   权重值对象
│   └── errors.ts                #   领域验证错误
├── application/                 # 应用服务层 (17 文件)
│   ├── backtest-service.ts      #   回测服务 (16 imports, 高耦合)
│   ├── montecarlo-service.ts    #   蒙特卡洛服务
│   ├── optimize-service.ts      #   优化器服务
│   ├── tactical-application-service.ts  # 战术配置服务
│   ├── grid-application-service.ts      # 网格搜索服务
│   ├── backtest-helpers.ts      #   共享助手 (340行, 含 translateDomainError)
│   ├── analysis-orchestrator.ts #   分析编排器
│   ├── signal-orchestrator.ts   #   信号编排器
│   ├── backtestCompletedHandler.ts  # 完成事件处理器
│   ├── runCompletedHandler.ts       # Run 完成事件处理器
│   ├── auditStorageService.ts   #   审计存储 (450行)
│   ├── webhookService.ts        #   Webhook 服务 (372行)
│   ├── auth/                    #   认证用例
│   │   ├── userService.ts       #   用户服务
│   │   ├── mfaService.ts        #   多因素认证
│   │   ├── passwordPolicy.ts    #   密码策略
│   │   └── loginLockout.ts      #   登录锁定
│   ├── billing/                 #   计费用例
│   │   ├── billingService.ts    #   Stripe 计费
│   │   ├── usageService.ts      #   用量跟踪
│   │   └── planLimitsService.ts #   套餐限制
│   └── org/                     #   组织用例
│       ├── membershipService.ts #   成员管理
│       └── invitationService.ts #   邀请服务
├── infrastructure/              # 基础设施层 (18 文件)
│   ├── dataFacade.ts            #   数据门面 (228行)
│   ├── dataQuery.ts             #   数据查询 (577行, 含熔断器+信号量)
│   ├── dataCache.ts             #   数据缓存 (413行)
│   ├── dataFetch.ts             #   数据抓取
│   ├── cpiLoader.ts             #   CPI 加载
│   ├── apiKeyVerifier.ts        #   API 密钥验证
│   ├── apiKeyMonitoring.ts      #   API 密钥监控
│   ├── platformAdminBootstrap.ts # 平台管理员引导
│   ├── mailService.ts           #   邮件发送 (nodemailer)
│   ├── outboxWriter.ts          #   Outbox 写入器
│   ├── outboxPublisher.ts       #   Outbox 发布器 (432行)
│   ├── outboxKafkaConsumer.ts   #   Kafka CDC 消费者
│   ├── redisClient.ts           #   Redis 客户端
│   ├── redisHealth.ts           #   Redis 健康检查
│   ├── rbacCache.ts             #   RBAC 缓存
│   ├── unleashClient.ts         #   Unleash 功能开关
│   ├── minioClient.ts           #   MinIO 对象存储
│   └── tickerDataService.ts     #   Ticker 数据服务
├── middleware/                  # 中间件 (21 文件)
│   ├── jwtAuth.ts               #   JWT 认证 (核心)
│   ├── jwtSigner.ts             #   JWT 签名
│   ├── jwtVerify.ts             #   JWT 验证
│   ├── refreshToken.ts          #   刷新令牌
│   ├── tokenRotation.ts         #   令牌轮换
│   ├── apiKeyAuth.ts            #   API 密钥认证
│   ├── devBypass.ts             #   开发绕过
│   ├── authShared.ts            #   认证共享
│   ├── authTypes.ts             #   认证类型
│   ├── rbac.ts                  #   RBAC 权限 (3角色×7权限)
│   ├── middlewareChains.ts      #   中间件链组合
│   ├── quota.ts                 #   配额检查
│   ├── errorHandler.ts          #   错误处理 (RFC 7807)
│   ├── requestTimeout.ts        #   请求超时
│   ├── deprecationHeaders.ts    #   废弃头
│   ├── tenantContext.ts         #   租户上下文
│   ├── auditLog.ts              #   审计日志
│   ├── idempotency.ts           #   幂等性
│   ├── validate.ts              #   Zod 验证
│   ├── openapiUi.ts             #   Swagger UI
│   └── featureFlag.ts           #   功能开关
├── repositories/               # 10 文件：数据仓库
│   ├── apiKeyRepo.ts            #   API 密钥仓库 (409行)
│   ├── backtestRunRepo.ts       #   回测运行仓库
│   ├── invitationRepo.ts        #   邀请仓库
│   ├── membershipRepo.ts        #   成员仓库
│   ├── orgRepo.ts               #   组织仓库
│   ├── portfolioRepo.ts         #   投资组合仓库
│   ├── rbacRepo.ts              #   RBAC 仓库 (345行)
│   ├── savedConfigRepo.ts       #   保存配置仓库
│   ├── tacticalConfigRepository.ts  # 战术配置仓库
│   └── userRepo.ts              #   用户仓库
├── routes/                     # 27 文件：路由处理器
│   ├── backtestRoutes.ts        #   回测路由 (454行)
│   ├── analysisRoutes.ts        #   分析路由 (736行测试)
│   ├── authRoutes.ts            #   认证路由 (355行)
│   ├── adminRoutes.ts           #   管理路由
│   ├── webhookRoutes.ts         #   Webhook 路由 (395行)
│   ├── ... (其他 22 个路由)
│   └── routeUtils.ts            #   路由工具函数
├── schemas/                    # 15 文件：Zod 验证
│   ├── backtest.ts              #   回测 Schema
│   ├── optimizer.ts             #   优化器 Schema
│   ├── tactical.ts              #   战术配置 Schema
│   ├── openapi-registry.ts      #   OpenAPI 注册 (1060行)
│   └── ... (其他 11 个 Schema)
├── queues/                     # 8 文件：BullMQ 队列
│   ├── backtestQueue.ts         #   回测队列
│   ├── webhookQueue.ts          #   Webhook 队列
│   ├── dataUpdateQueue.ts       #   数据更新队列
│   ├── dataUpdateWorker.ts      #   数据更新工作者
│   ├── worker.ts                #   工作者 (485行)
│   ├── workerEntrypoint.ts      #   工作者入口
│   ├── healthCheck.ts           #   健康检查
│   └── jobIdempotency.ts        #   任务幂等性
├── services/                   # 1 文件：WebSocket
│   └── backtestWs.ts            #   回测 WebSocket (426行, 含 eslint-disable)
└── utils/                      # 19 文件：工具函数
    ├── engineClient.ts          #   引擎客户端
    ├── grpcClient.ts            #   gRPC 客户端 (PoC 存根)
    ├── httpClient.ts            #   HTTP 客户端
    ├── tracePropagation.ts      #   链路传播
    ├── logger.ts                #   日志 (Pino)
    ├── logSanitizer.ts          #   日志清理
    ├── metrics.ts               #   Prometheus 指标 (450行)
    ├── rateLimiter.ts           #   限流器
    ├── errors.ts                #   错误类型
    ├── crypto.ts                #   加密工具
    ├── envelopeEncryption.ts    #   信封加密
    ├── integrity.ts             #   完整性校验 (283行)
    ├── tickerValidation.ts      #   Ticker 验证
    ├── dateUtils.ts             #   日期工具
    ├── numericRange.ts          #   数值范围
    ├── timeout.ts               #   超时工具
    ├── redisFallback.ts         #   Redis 降级
    ├── requestContext.ts        #   请求上下文
    └── validation.ts            #   验证工具
```

### 4.2 `packages/frontend/` — React SPA (44,984 行)

```
src/
├── main.tsx                    # 入口：StrictMode + 字体 + i18n + CSS
├── App.tsx                     # 根组件：Router + ErrorBoundary + 5 路由组
├── routes/
│   ├── index.tsx               # 路由聚合 (28+ 页面, 懒加载)
│   ├── PublicRoutes.tsx        # 公开路由
│   ├── AuthRoutes.tsx          # 认证路由
│   ├── AccountRoutes.tsx       # 账户路由
│   └── AdminRoutes.tsx         # 管理路由
├── store/                      # Zustand 状态管理
│   ├── authStore.ts            # 认证 + 多租户 (267行)
│   ├── backtestStore.ts        # 回测状态 (4 slice 组合)
│   ├── portfolioSlice.ts       # 投资组合 slice
│   ├── cashflowSlice.ts        # 现金流 slice
│   ├── executionSlice.ts       # 执行 slice
│   ├── toastStore.ts           # Toast 通知
│   ├── backtestHelpers.ts      # 回测助手
│   └── types.ts                # 状态类型定义
├── hooks/                      # 18 个自定义 Hook
│   ├── useComputeTool.ts       # 通用计算工具 Hook
│   ├── useBacktestWs.ts        # 回测 WebSocket Hook (426行)
│   ├── useBacktestWsXState.ts  # XState 版 (PoC 存根)
│   ├── useAnalysisData.ts      # 分析数据 Hook
│   ├── useEngineHealth.ts      # 引擎健康检查
│   ├── useAsyncAction.ts       # 异步操作 Hook
│   ├── useChartInteractions.ts # 图表交互 Hook
│   ├── useTheme.ts             # 主题 Hook
│   ├── useIdleTimeout.ts       # 空闲超时
│   ├── usePolling.ts           # 轮询
│   └── ... (其他 8 个页面状态 Hook)
├── pages/                      # 26 个页面目录
│   ├── backtest/               # 回测主页 (含优化器/路由)
│   ├── analysis/               # 单资产分析
│   ├── monte-carlo/            # 蒙特卡洛模拟
│   ├── optimizer/              # 有效前沿优化
│   ├── efficient-frontier/     # 有效前沿
│   ├── tactical/               # 战术配置
│   ├── signal/                 # 信号分析
│   ├── pca/                    # PCA 分析
│   ├── letf/                   # LETF 滑点
│   ├── goal-optimizer/         # 目标优化器
│   ├── factor-regression/      # 因子回归
│   ├── calculators/            # 金融计算器
│   ├── data-engine/            # 数据引擎
│   ├── rebalancing-sensitivity/ # 再平衡敏感性
│   ├── lump-sum-dca/           # 一次投入 vs 定投
│   ├── auth/                   # 登录/注册/验证
│   ├── account/                # 账户管理 (含计费)
│   ├── admin/                  # 管理控制台
│   ├── org/                    # 组织成员
│   ├── about/                  # 关于
│   └── help/                   # 帮助
├── components/                 # 44 个组件
│   ├── charts/                 # 图表组件 (Growth/Pie/Heatmap/Correlation 等)
│   ├── layout/                 # Navbar + Footer
│   ├── ui/                     # UI 原语 (Button/Input/Select/Dialog 等)
│   ├── form/                   # 表单组件
│   ├── auth/                   # 认证组件
│   ├── shells/                 # 页面外壳
│   ├── portfolioEditor/        # 投资组合编辑器
│   ├── statistics-table/       # 统计表格
│   ├── ErrorBoundary.tsx       # 错误边界 (161行)
│   ├── PortfolioEditor.tsx     # 投资组合编辑器 (387行)
│   ├── StatisticsTable.tsx     # 统计表 (197行)
│   ├── Toast.tsx               # Toast 通知
│   └── ... (其他组件)
├── lib/                        # 工具
│   └── utils.ts                # cn() Tailwind 合并
├── data/                       # 静态数据
├── i18n/                       # 国际化 (中/英)
├── styles/                     # CSS 样式
└── utils/                      # 前端工具
```

### 4.3 `engine-go/` — Go 计算引擎 (10,797 行)

```
cmd/server/main.go              # 入口：Gin + OTel + pprof
internal/
├── server/                     # 10 文件：HTTP 处理器
│   ├── router.go               # 路由设置 (14 端点 + 限流 + 认证)
│   ├── handler_backtest.go     # 回测处理器
│   ├── handler_optimize.go     # 优化器/蒙特卡洛/有效前沿处理器
│   ├── handler_analysis.go     # 分析/PCA/LETF/因子回归处理器
│   ├── handler_tactical.go     # 战术配置处理器
│   ├── handler_calculators.go  # 计算器处理器
│   ├── handler_signal.go       # 信号分析处理器
│   ├── helpers.go              # 共享处理器助手
│   └── grpc/                   # gRPC (存根/研究)
├── engine/                     # 20 文件：核心引擎
│   ├── types.go                # 所有类型定义 (300行, 60+ 统计字段)
│   ├── backtest.go             # RunBacktest() 主入口 (187行)
│   ├── backtest_curve.go       # 增长曲线计算
│   ├── backtest_stats.go       # 统计指标计算
│   ├── backtest_helpers.go     # 辅助函数
│   ├── drawdown.go             # 回撤计算
│   ├── fingerprint.go          # 确定性指纹 (SHA-256)
│   ├── statistics_request.go   # 统计请求类型
│   ├── statistics_returns.go   # 收益统计
│   ├── statistics_risk.go      # 风险统计 (VaR/CVaR)
│   ├── statistics_drawdown.go  # 回撤统计
│   ├── statistics_advanced.go  # 高级统计
│   ├── statistics_withdrawal.go # SWR/PWR 提款统计
│   └── tactical/               # 战术配置引擎
│       ├── backtest.go         # 战术回测 (331行)
│       ├── grid.go             # 网格搜索
│       ├── indicators.go       # 指标实现
│       └── types.go            # 战术类型
├── montecarlo/                 # 6 文件：蒙特卡洛模拟
│   └── montecarlo.go           # 块自助法 + 并行模拟 (211行)
├── optimizer/                  # 6 文件：Markowitz 优化
│   └── optimizer.go            # 拉格朗日乘子法 + 有效前沿 (344行)
├── analysis/                   # 2 文件：单资产分析 (327行)
├── signal/                     # 5 文件：信号分析
│   ├── types.go                # 类型定义
│   ├── statistics.go           # 统计/权益曲线
│   ├── single.go               # 单信号 (MA/RSI/MACD/Bollinger)
│   ├── dual.go                 # 双信号 (AND/OR/XOR)
│   └── multi.go                # 多信号 (加权/投票/排名)
├── pca/                        # 1 文件：主成分分析
├── letf/                       # 1 文件：LETF 滑点分析
├── goaloptimizer/              # 1 文件：目标优化器 (322行)
├── factorregression/           # 1 文件：Fama-French 因子回归
├── calculators/                # 1 文件：金融计算器
├── indicators/                 # 2 文件：技术指标 (SMA/EMA/RSI/MACD/Bollinger)
├── engineutil/                 # 3 文件：共享工具
├── mathutil/                   # 1 文件：数学工具
└── middleware/                 # 3 文件：认证 + 限流 + 安全头
```

### 4.4 `data-fetcher/` — Go 数据服务 (5,577 行)

```
main.go                         # 入口：Gin + 数据源注册 + 限流 + OTel
cmd/
├── bs_smoke/                   # BaoStock 冒烟测试
└── worker/                     # 9 文件：数据工作者
    ├── main.go                 # 工作者入口
    ├── commands.go             # 命令
    ├── db.go                   # 数据库操作
    ├── fetch.go                # 数据抓取
    ├── providers.go            # 数据源配置
    ├── universe.go             # 市场全量
    ├── universe_builder.go     # 市场构建器 (285行)
    ├── sim.go                  # 模拟工具
    └── sim_splice.go           # 模拟拼接 (300行)
internal/
├── handlers/                   # 2 文件：HTTP 处理器
│   ├── data.go                 # 数据 API (223行)
│   └── baostock.go             # BaoStock API
├── provider/                   # 数据源注册表
│   └── registry.go             # Provider 接口 + 降级链 (177行)
├── akshare/                    # AKShare 实现 (A股)
├── finnhub/                    # Finnhub 实现
├── twelvedata/                 # Twelve Data 实现
├── yfinance/                   # Yahoo Finance 实现
├── httpclient/                 # HTTP 客户端
├── providerutil/               # 数据源工具
├── store/                      # PostgreSQL 存储
│   └── store.go                # 数据存储 (306行)
└── middleware/                 # 中间件 (认证 + CORS)
baostock/                       # 4 文件：BaoStock TCP 协议实现
├── baostock.go                 # TCP 客户端
├── baostock_protocol.go        # 协议实现
├── baostock_parse.go           # 响应解析
└── baostock_test.go            # 测试
```

### 4.5 `packages/shared/` — 共享类型 (1,086 行)

```
types/
├── index.ts                    # Barrel 导出
├── portfolio.ts                # Portfolio, Asset, RebalanceFrequency, CashflowLeg
├── backtest.ts                 # BacktestParameters, PriceData, PortfolioResult, DrawdownEpisode
├── statistics.ts               # Statistics (100+ 字段: CAGR, Sharpe, Sortino, VaR/CVaR, SWR, PWR...)
├── monte-carlo.ts              # MonteCarloResult, PerPathMetrics
├── optimizer.ts                # EfficientFrontierPoint, OptimizationResult
├── tactical.ts                 # TechnicalIndicator, SignalCondition, TradingSignal
├── signal.ts                   # SignalAnalysisRequest/Result
├── pca.ts                      # PCARequest, PCAResult
├── letf.ts                     # LETFRequest, LETFResult
├── goal.ts                     # GoalOptimizerRequest/Result
├── marketStats.ts              # MarketStats
└── org.ts                      # OrgRole 类型
constants.ts                    # MAX_TICKERS, TRADING_DAYS_PER_YEAR, CHART_COLORS
```

### 4.6 `migrations/` — 27 个 PostgreSQL 迁移

| 编号 | 名称                               | 用途                                     |
| ---- | ---------------------------------- | ---------------------------------------- |
| 001  | init                               | 初始 schema (tickers, prices, exchanges) |
| 002  | fts                                | 全文搜索 (tsvector + GIN)                |
| 003  | index_cleanup                      | 索引优化                                 |
| 004  | users                              | 用户表                                   |
| 005  | outbox                             | Outbox 模式表                            |
| 006  | outbox_dedup                       | Outbox 去重                              |
| 007  | least_privilege                    | 最小权限角色                             |
| 008  | checks                             | 检查约束                                 |
| 009  | tenancy                            | 多租户 RLS                               |
| 010  | user_email                         | 用户邮箱                                 |
| 011  | billing                            | Stripe 计费表                            |
| 012  | usage                              | 用量计数器                               |
| 013  | drop_redundant_index               | 索引清理                                 |
| 014  | drop_chk_prices_volume_nonnegative | 约束清理                                 |
| 015  | add_exchange_column                | 交易所列                                 |
| 016  | backtest_progress                  | 回测进度                                 |
| 017  | admin_api_key_db                   | 管理员 API 密钥                          |
| 018  | timescaledb                        | TimescaleDB 扩展                         |
| 019  | security_compliance                | 安全合规                                 |
| 020  | custom_rbac                        | 自定义 RBAC                              |
| 021  | webhooks                           | Webhook 订阅                             |
| 022  | audit_storage                      | 审计日志存储                             |
| 023  | cagg_backfill                      | 连续聚合回填                             |
| 024  | rls_extension                      | RLS 扩展                                 |
| 025  | audit_chain                        | 审计链                                   |
| 026  | tactical_configs                   | 战术配置                                 |
| 027  | timescale_cagg                     | TimescaleDB 连续聚合                     |

---

## 5. 测试覆盖率与分布

### 5.1 测试文件统计

| 测试类型         | TypeScript 文件 | Go 文件 |  总计   |    行数     |
| ---------------- | :-------------: | :-----: | :-----: | :---------: |
| Unit             |       173       |   25    |   198   |   38,600    |
| Integration      |       20        |    0    |   20    |    2,953    |
| Contract         |        1        |    0    |    1    |     169     |
| Chaos            |        5        |    0    |    5    |     567     |
| Property         |        2        |    0    |    2    |     229     |
| E2E (Playwright) |       10        |    0    |   10    |     636     |
| Load (k6)        |        3        |    0    |    3    |     559     |
| **总计**         |     **214**     | **25**  | **239** | **~43,713** |

### 5.2 单元测试细分 (tests/unit/)

| 子目录          | 文件数 |  行数  | 说明                      |
| --------------- | :----: | :----: | ------------------------- |
| utils/          |   27   | ~3,900 | 工具函数测试              |
| routes/         |   27   | ~7,100 | 路由处理器测试            |
| services/       |   24   | ~4,500 | 服务层测试                |
| middleware/     |   22   | ~5,200 | 中间件测试 (JWT 占比最大) |
| application/    |   15   | ~3,000 | 应用服务测试              |
| schemas/        |   11   | ~1,400 | Zod Schema 验证测试       |
| store/          |   9    | ~2,400 | Zustand Store 测试        |
| domain/         |   9    | ~1,200 | 领域层测试                |
| hooks/          |   7    | ~1,500 | React Hook 测试           |
| components/     |   5    |  ~300  | 组件测试                  |
| db/             |   4    |  ~900  | 数据库测试                |
| queues/         |   3    |  ~800  | 队列测试                  |
| config/         |   3    |  ~500  | 配置测试                  |
| pages/          |   2    |  ~125  | 页面测试                  |
| api/            |   2    |  ~240  | API 测试                  |
| repositories/   |   1    |  ~316  | 仓库测试                  |
| infrastructure/ |   1    |  ~113  | 基础设施测试              |
| federation/     |   1    |  ~39   | 模块联邦测试              |

### 5.3 集成测试 (tests/integration/)

| 文件                                 | 行数 | 测试内容       |
| ------------------------------------ | :--: | -------------- |
| api.test.ts                          | 376  | API 端到端流程 |
| backtest-async.integration.test.ts   | 295  | 异步回测       |
| pages.test.ts                        | 239  | 页面渲染       |
| dataCache.redis.test.ts              | 191  | Redis 缓存     |
| rls-isolation.integration.test.ts    | 175  | 租户隔离       |
| backtest-e2e.integration.test.ts     | 160  | 回测端到端     |
| data-degradation.integration.test.ts | 147  | 数据降级       |
| orgs.integration.test.ts             | 147  | 组织管理       |
| jobs.integration.test.ts             | 140  | 任务管理       |
| optimizer.integration.test.ts        | 134  | 优化器         |
| billing.integration.test.ts          | 131  | Stripe 计费    |
| chaos-db-outage.integration.test.ts  | 131  | 数据库故障     |
| portfolios.integration.test.ts       | 130  | 投资组合       |
| configs.integration.test.ts          | 112  | 配置持久化     |
| api-keys.integration.test.ts         | 106  | API 密钥       |
| app-security.test.ts                 |  95  | 安全测试       |
| db.integration.test.ts               |  83  | 数据库         |
| runs.integration.test.ts             |  93  | 运行历史       |
| data.test.ts                         |  48  | 数据 API       |
| auth.test.ts                         |  20  | 认证           |

### 5.4 Go 测试 (engine-go)

| 文件                        | 行数 | 测试内容   |
| --------------------------- | :--: | ---------- |
| statistics_advanced_test.go | 367  | 高级统计   |
| statistics_test.go          | 329  | 基本统计   |
| types_test.go               | 299  | 类型测试   |
| engineutil_test.go          | 262  | 引擎工具   |
| optimizer_test.go           | 267  | 优化器     |
| optimizer_internal_test.go  | 239  | 优化器内部 |
| backtest_test.go            | 234  | 回测引擎   |
| drawdown_test.go            | 229  | 回撤计算   |
| router_test.go              | 227  | 路由测试   |
| montecarlo_test.go          | 199  | 蒙特卡洛   |
| analysis_test.go            | 177  | 分析       |
| indicators_test.go          | 156  | 技术指标   |
| auth_test.go                |  75  | 认证       |
| fingerprint_test.go         |  58  | 指纹       |

### 5.5 Go 测试 (data-fetcher)

| 文件                 | 行数 | 测试内容             |
| -------------------- | :--: | -------------------- |
| httpclient_test.go   | 293  | HTTP 客户端          |
| finnhub_test.go      | 269  | Finnhub 数据源       |
| yfinance_test.go     | 229  | Yahoo Finance 数据源 |
| twelvedata_test.go   | 225  | Twelve Data 数据源   |
| akshare_test.go      | 217  | AKShare 数据源       |
| provider_test.go     | 180  | Provider 注册表      |
| baostock_test.go     | 116  | BaoStock 数据源      |
| main_test.go         |  95  | 主入口               |
| providerutil_test.go |  92  | Provider 工具        |
| auth_test.go         |  63  | 认证                 |
| exchange_test.go     |  35  | 交易所推导           |

### 5.6 覆盖配置

```typescript
// vitest.workspace.ts 中的覆盖配置
coverage: {
  provider: 'v8',
  reporter: ['html', 'lcov', 'text', 'json-summary'],
  reportsDirectory: 'coverage/vitest',
  include: [
    'packages/backend/src/**',
    'packages/frontend/src/store/**',
    'packages/frontend/src/hooks/**',
    'packages/frontend/src/utils/**',
  ],
  thresholds: {
    global: { lines: 80, functions: 80, branches: 70, statements: 80 },
    'packages/backend/src/domain/**': { lines: 95 },
    'packages/backend/src/middleware/**': { lines: 90 },
    'packages/backend/src/application/**': { lines: 85 },
    'packages/frontend/src/store/**': { lines: 80 },
  },
}
```

### 5.7 现有覆盖率数据 (coverage/coverage-summary.json)

| 指标      |         覆盖率         | 说明                   |
| --------- | :--------------------: | ---------------------- |
| Lines     | 25.44% (13,889/54,579) | 含所有文件 (all: true) |
| Functions |   67.47% (780/1,156)   | 函数级                 |
| Branches  |  80.78% (2,993/3,705)  | 分支级                 |

> 注意：行覆盖率低是因为 `all: true` 包含了所有源文件，多数文件尚未被测试覆盖。函数级 67.47% 和分支级 80.78% 说明已有测试的核心逻辑覆盖较好。

---

## 6. 已实现功能清单

### 6.1 计算引擎功能 (Go Engine)

| 功能                                  | 端点                                    |    状态     |
| ------------------------------------- | --------------------------------------- | :---------: |
| 投资组合回测 (含增长曲线/回撤/统计)   | `POST /api/engine/backtest`             | ✅ 完整实现 |
| 单资产分析                            | `POST /api/engine/analysis`             | ✅ 完整实现 |
| Markowitz 投资组合优化                | `POST /api/engine/optimize`             | ✅ 完整实现 |
| 有效前沿计算                          | `POST /api/engine/efficient-frontier`   | ✅ 完整实现 |
| 蒙特卡洛模拟 (块自助法)               | `POST /api/engine/monte-carlo`          | ✅ 完整实现 |
| 统计指标计算                          | `POST /api/engine/statistics`           | ✅ 完整实现 |
| 信号分析 (单/双/多信号)               | `POST /api/engine/signal-analyze`       | ✅ 完整实现 |
| PCA 主成分分析                        | `POST /api/engine/pca`                  | ✅ 完整实现 |
| LETF 滑点分析                         | `POST /api/engine/letf-analyze`         | ✅ 完整实现 |
| 目标优化器                            | `POST /api/engine/goal-optimize`        | ✅ 完整实现 |
| 战术配置回测                          | `POST /api/engine/tactical-backtest`    | ✅ 完整实现 |
| 战术网格搜索                          | `POST /api/engine/tactical-grid-search` | ✅ 完整实现 |
| Fama-French 因子回归                  | `POST /api/engine/factor-regression`    | ✅ 完整实现 |
| 金融计算器 (CAGR/SWR/Two-Fund)        | `POST /api/engine/calculators`          | ✅ 完整实现 |
| 技术指标 (SMA/EMA/RSI/MACD/Bollinger) | 内部使用                                | ✅ 完整实现 |
| 确定性指纹 (SHA-256)                  | 内部使用                                | ✅ 完整实现 |

### 6.2 后端 API 功能 (Express)

| 功能                            | 路由                                       |    状态     |
| ------------------------------- | ------------------------------------------ | :---------: |
| 健康检查                        | `GET /api/health`                          | ✅ 完整实现 |
| 历史行情数据                    | `GET /api/v1/data/history`                 | ✅ 完整实现 |
| Ticker 搜索                     | `GET /api/v1/data/search`                  | ✅ 完整实现 |
| Ticker 验证                     | `POST /api/v1/data/validate`               | ✅ 完整实现 |
| CPI 数据                        | `GET /api/v1/data/cpi`                     | ✅ 完整实现 |
| 数据管理 (管理端)               | `GET/POST /api/v1/data/manage/*`           | ✅ 完整实现 |
| 投资组合回测                    | `POST /api/v1/backtest/portfolio`          | ✅ 完整实现 |
| 回测分析                        | `POST /api/v1/backtest/analysis`           | ✅ 完整实现 |
| 回测优化                        | `POST /api/v1/backtest/optimize`           | ✅ 完整实现 |
| 蒙特卡洛                        | `POST /api/v1/backtest/monte-carlo`        | ✅ 完整实现 |
| 有效前沿                        | `POST /api/v1/backtest/efficient-frontier` | ✅ 完整实现 |
| 回测优化器                      | `POST /api/v1/backtest-optimizer/*`        | ✅ 完整实现 |
| 战术配置回测                    | `POST /api/v1/tactical/*`                  | ✅ 完整实现 |
| 战术网格搜索                    | `POST /api/v1/tactical-grid/*`             | ✅ 完整实现 |
| 战术配置 CRUD                   | `CRUD /api/v1/tactical/configs`            | ✅ 完整实现 |
| 信号分析                        | `POST /api/v1/signal/*`                    | ✅ 完整实现 |
| 分析 (PCA/LETF/因子回归/计算器) | `POST /api/v1/{pca,letf,...}`              | ✅ 完整实现 |
| 用户注册/登录/登出              | `POST /api/v1/auth/*`                      | ✅ 完整实现 |
| JWT 刷新/令牌轮换               | `POST /api/v1/auth/refresh`                | ✅ 完整实现 |
| API 密钥管理                    | `CRUD /api/v1/keys`                        | ✅ 完整实现 |
| 投资组合持久化                  | `CRUD /api/v1/portfolios`                  | ✅ 完整实现 |
| 配置持久化                      | `CRUD /api/v1/configs`                     | ✅ 完整实现 |
| 运行历史                        | `CRUD /api/v1/runs`                        | ✅ 完整实现 |
| 组织管理                        | `CRUD /api/v1/orgs`                        | ✅ 完整实现 |
| Stripe 计费                     | `POST/GET /api/v1/billing/*`               | ✅ 完整实现 |
| 异步任务状态                    | `GET /api/v1/jobs/:id`                     | ✅ 完整实现 |
| Webhook 管理                    | `CRUD /api/v1/webhooks`                    | ✅ 完整实现 |
| 审计日志                        | `GET /api/v1/admin/audit-logs`             | ✅ 完整实现 |
| RBAC 管理                       | `POST /api/v1/admin/rbac`                  | ✅ 完整实现 |
| 管理控制台                      | `GET /api/v1/admin/*`                      | ✅ 完整实现 |
| WebSocket 实时进度              | `WS /api/v1/ws/runs/:jobId`                | ✅ 完整实现 |
| 前端错误上报                    | `POST /api/v1/errors`                      | ✅ 完整实现 |
| 功能开关                        | `GET /api/v1/feature-flags`                | ✅ 完整实现 |
| Swagger UI                      | `GET /api/docs`                            | ✅ 完整实现 |
| OpenAPI 运行时验证              | 开发环境                                   | ✅ 完整实现 |

### 6.3 前端页面功能 (React SPA)

| 页面                | 路由                               |    状态     |
| ------------------- | ---------------------------------- | :---------: |
| 投资组合回测 (主页) | `/`                                | ✅ 完整实现 |
| 单资产分析          | `/analysis`                        | ✅ 完整实现 |
| 蒙特卡洛模拟        | `/monte-carlo`                     | ✅ 完整实现 |
| 有效前沿优化        | `/optimizer`                       | ✅ 完整实现 |
| 有效前沿            | `/efficient-frontier`              | ✅ 完整实现 |
| 再平衡敏感性        | `/rebalancing-sensitivity`         | ✅ 完整实现 |
| 一次投入 vs 定投    | `/lumpsum-vs-dca`                  | ✅ 完整实现 |
| 因子回归            | `/factor-regression`               | ✅ 完整实现 |
| 金融计算器          | `/calculators`                     | ✅ 完整实现 |
| 数据引擎            | `/data-engine`                     | ✅ 完整实现 |
| 战术配置            | `/tactical`                        | ✅ 完整实现 |
| 回测优化器          | `/backtest-optimizer`              | ✅ 完整实现 |
| PCA 分析            | `/pca`                             | ✅ 完整实现 |
| 信号分析            | `/signal-analyzer`                 | ✅ 完整实现 |
| 双信号              | `/dual-signal`                     | ✅ 完整实现 |
| 多信号              | `/multi-signal`                    | ✅ 完整实现 |
| LETF 滑点           | `/letf-slippage`                   | ✅ 完整实现 |
| 战术网格            | `/tactical-grid`                   | ✅ 完整实现 |
| 目标优化器          | `/goal-optimizer`                  | ✅ 完整实现 |
| 登录/注册           | `/login`, `/signup`                | ✅ 完整实现 |
| 账户管理            | `/account`                         | ✅ 完整实现 |
| 计费/套餐           | `/billing`, `/pricing`, `/upgrade` | ✅ 完整实现 |
| 组织成员            | `/org/members`                     | ✅ 完整实现 |
| 管理控制台          | `/admin`                           | ✅ 完整实现 |
| 系统监控            | `/admin/monitor`                   | ✅ 完整实现 |
| 数据管理            | `/admin/data`                      | ✅ 完整实现 |
| 设置                | `/admin/settings`                  | ✅ 完整实现 |
| 关于/帮助/变更日志  | `/about`, `/help`, `/changelog`    | ✅ 完整实现 |
| 国际化切换 (中/英)  | 全局                               | ✅ 完整实现 |
| 主题切换            | 全局                               | ✅ 完整实现 |
| 货币切换            | 全局                               | ✅ 完整实现 |

### 6.4 基础设施功能

| 功能                         | 实现                        |         状态         |
| ---------------------------- | --------------------------- | :------------------: |
| PostgreSQL 主从连接池        | pg Pool + 读写分离          |     ✅ 完整实现      |
| TimescaleDB 超表/连续聚合    | 迁移 018/027                |     ✅ 完整实现      |
| Redis 缓存/会话/限流/队列    | ioredis + BullMQ            |     ✅ 完整实现      |
| Redis Sentinel 高可用        | docker-compose              |     ✅ 完整实现      |
| Outbox 模式 (LISTEN/NOTIFY)  | PostgreSQL 通知             |     ✅ 完整实现      |
| Outbox 模式 (Kafka CDC)      | Debezium + Kafka            |     ✅ 完整实现      |
| JWT 认证 (HS256/RS256)       | jose 库                     |     ✅ 完整实现      |
| 令牌轮换 + 刷新族            | 自定义实现                  |     ✅ 完整实现      |
| RBAC (3 角色 × 7 权限)       | 自定义实现                  |     ✅ 完整实现      |
| 多租户 RLS                   | PostgreSQL RLS              |     ✅ 完整实现      |
| 组织 API 密钥                | 哈希存储 + 可吊销           |     ✅ 完整实现      |
| 平台管理员密钥               | 环境变量 + DB 同步          |     ✅ 完整实现      |
| Stripe 计费                  | Checkout + Portal + Webhook |     ✅ 完整实现      |
| 用量跟踪 + 套餐限制          | 自定义实现                  |     ✅ 完整实现      |
| 限流 (多级)                  | express-rate-limit + Redis  |     ✅ 完整实现      |
| 熔断器 (PostgreSQL/Go 服务)  | opossum + gobreaker         |     ✅ 完整实现      |
| 信号量 (Go 服务并发)         | 自定义 Semaphore (10)       |     ✅ 完整实现      |
| 请求超时                     | 自定义中间件 (30s)          |     ✅ 完整实现      |
| 数据降级 (DB → Go 服务)      | 多级退化链                  |     ✅ 完整实现      |
| 引擎故障 (503 + Retry-After) | 无 Node 回退                |     ✅ 完整实现      |
| 幂等性                       | 自定义中间件                |     ✅ 完整实现      |
| 审计日志                     | 自定义中间件 + 存储         |     ✅ 完整实现      |
| 不可篡改审计链               | 哈希链                      |     ✅ 完整实现      |
| Webhook 传递                 | BullMQ 队列 + 重试          |     ✅ 完整实现      |
| 空闲会话超时                 | 前端 Hook                   |     ✅ 完整实现      |
| 密码策略 + MFA               | 后端服务                    |     ✅ 完整实现      |
| 登录锁定                     | Redis 计数 + 时间窗口       |     ✅ 完整实现      |
| OpenTelemetry 链路追踪       | OTLP exporter               |     ✅ 完整实现      |
| Prometheus 指标              | prom-client                 |     ✅ 完整实现      |
| 优雅关闭                     | SIGTERM/SIGINT 处理         |     ✅ 完整实现      |
| 未捕获异常处理               | 进程退出 + K8s 重启         |     ✅ 完整实现      |
| 模块联邦 (ADR-050)           | Vite Federation             |     ✅ 完整实现      |
| OpenAPI 3.0 文档             | zod-to-openapi              |     ✅ 完整实现      |
| 运行时 API 验证              | express-openapi-validator   | ✅ 完整实现 (非生产) |
| 功能开关 (Unleash)           | unleash-client              |     ✅ 完整实现      |
| 邮件发送                     | nodemailer                  |     ✅ 完整实现      |
| 对象存储 (MinIO)             | minio 客户端                |     ✅ 完整实现      |
| Kubernetes 部署              | k8s/ 目录                   |     ✅ 完整实现      |
| Apache APISIX 网关           | config/apisix/              |     ✅ 完整实现      |
| 混沌工程                     | 5 个实验                    |     ✅ 完整实现      |
| 负载测试                     | 3 个 k6 脚本                |     ✅ 完整实现      |
| 属性测试                     | fast-check                  |     ✅ 完整实现      |
| 契约测试                     | OpenAPI 3.0                 |     ✅ 完整实现      |
| 审计合规 (等保三级)          | 19 份合规文档               |     ✅ 完整实现      |

### 6.5 未完成/存根功能

| 功能                  | 位置                                               |              状态              |
| --------------------- | -------------------------------------------------- | :----------------------------: |
| gRPC 服务器           | engine-go/internal/server/grpc/                    | ⚠️ 存根 (skeleton + NOTE 注释) |
| gRPC 客户端           | packages/backend/src/utils/grpcClient.ts           | ⚠️ 存根 (PoC stub + NOTE 注释) |
| XState WebSocket Hook | packages/frontend/src/hooks/useBacktestWsXState.ts | ⚠️ 存根 (PoC stub + NOTE 注释) |
| 管理员批量导入        | 后端 API (返回 501)                                |      ⚠️ 已废弃 (ADR-042)       |
| Python 数据 CLI       | 已删除                                             |           ❌ 已退役            |

---

## 7. 关键文件/类/函数/模块

### 7.1 关键入口文件

| 文件                             | 行数 | 职责                                                          |
| -------------------------------- | :--: | ------------------------------------------------------------- |
| `packages/backend/src/server.ts` | 149  | API 服务器入口：优雅关闭、领域事件注册、Outbox 启动、异常处理 |
| `packages/backend/src/app.ts`    | 259  | Express 装配：43 个中间件 + 27 个路由组                       |
| `packages/frontend/src/main.tsx` |  14  | 前端入口：StrictMode + 字体 + i18n + CSS                      |
| `packages/frontend/src/App.tsx`  |  48  | 根组件：Router + ErrorBoundary + 5 路由组                     |
| `engine-go/cmd/server/main.go`   |  54  | Go 引擎入口：Gin + OTel + pprof                               |
| `data-fetcher/main.go`           | 155  | 数据服务入口：Gin + 数据源注册 + 限流 + OTel                  |

### 7.2 关键核心函数

| 函数                          | 位置                                                   | 行数 | 职责                        |
| ----------------------------- | ------------------------------------------------------ | :--: | --------------------------- |
| `RunBacktest()`               | `engine-go/internal/engine/backtest.go:50`             | 187  | 核心回测引擎入口            |
| `RunMonteCarlo()`             | `engine-go/internal/montecarlo/montecarlo.go:34`       | 211  | 块自助法蒙特卡洛模拟        |
| `Optimize()`                  | `engine-go/internal/optimizer/optimizer.go:50`         | 344  | Markowitz 优化 + 有效前沿   |
| `RunAnalysis()`               | `engine-go/internal/analysis/analysis.go:30`           | 327  | 单资产分析                  |
| `fetchHistoryData()`          | `packages/backend/src/infrastructure/dataFacade.ts:90` |  50  | 历史数据编排 (DB → Go 服务) |
| `queryPricesFromDb()`         | `packages/backend/src/infrastructure/dataQuery.ts:220` |  80  | PostgreSQL 价格查询         |
| `fetchMissingFromGoService()` | `packages/backend/src/infrastructure/dataQuery.ts:290` |  70  | Go 数据服务补齐             |
| `callGoDataService()`         | `packages/backend/src/infrastructure/dataQuery.ts:110` |  70  | 调用 Go 数据服务 (含信号量) |
| `withTenant()`                | `packages/backend/src/db/pool.ts:200`                  |  35  | 租户上下文事务 (RLS 强制)   |
| `triggerShutdown()`           | `packages/backend/src/server.ts:100`                   |  35  | 优雅关闭流程                |
| `AnalyzeSignal()`             | `engine-go/internal/signal/single.go:100`              | 154  | 单信号分析                  |
| `AnalyzeDualSignal()`         | `engine-go/internal/signal/dual.go:30`                 | 100  | 双信号分析                  |
| `AnalyzeMultiSignal()`        | `engine-go/internal/signal/multi.go:30`                | 148  | 多信号分析                  |

### 7.3 关键类/模块

| 类/模块                      | 位置                                                    | 职责                                                   |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `Portfolio` 聚合根           | `packages/backend/src/domain/aggregates/portfolio.ts`   | 投资组合 DDD 聚合根                                    |
| `Run` 聚合根                 | `packages/backend/src/domain/aggregates/run.ts`         | 运行状态机 (queued→running→completed/failed/cancelled) |
| `EventDispatcher`            | `packages/backend/src/domain/events/EventDispatcher.ts` | 领域事件分发器                                         |
| `Statistics` 结构体          | `engine-go/internal/engine/types.go`                    | 60+ 统计指标字段                                       |
| `BacktestRequest` 结构体     | `engine-go/internal/engine/types.go`                    | 回测请求类型                                           |
| `PortfolioResult` 结构体     | `engine-go/internal/engine/types.go`                    | 组合结果类型                                           |
| `Provider` 接口              | `data-fetcher/internal/provider/registry.go`            | 数据源接口                                             |
| `Registry`                   | `data-fetcher/internal/provider/registry.go`            | 数据源注册表 + 降级链                                  |
| `Semaphore`                  | `packages/backend/src/infrastructure/dataQuery.ts`      | Go 服务并发控制 (10)                                   |
| `CircuitBreaker` (opossum)   | `packages/backend/src/infrastructure/dataQuery.ts`      | PostgreSQL 熔断器                                      |
| `CircuitBreaker` (gobreaker) | `data-fetcher/internal/provider/registry.go`            | 数据源熔断器                                           |

### 7.4 关键中间件

| 中间件             | 位置                                                | 职责                       |
| ------------------ | --------------------------------------------------- | -------------------------- |
| `jwtAuth`          | `packages/backend/src/middleware/jwtAuth.ts`        | JWT 认证 (HS256/RS256)     |
| `rbac`             | `packages/backend/src/middleware/rbac.ts`           | 权限检查 (3 角色 × 7 权限) |
| `errorHandler`     | `packages/backend/src/middleware/errorHandler.ts`   | RFC 7807 错误处理          |
| `tenantContext`    | `packages/backend/src/middleware/tenantContext.ts`  | 多租户上下文               |
| `auditLog`         | `packages/backend/src/middleware/auditLog.ts`       | 审计日志                   |
| `idempotency`      | `packages/backend/src/middleware/idempotency.ts`    | 幂等性                     |
| `apiKeyAuth`       | `packages/backend/src/middleware/apiKeyAuth.ts`     | API 密钥认证               |
| `requestTimeout`   | `packages/backend/src/middleware/requestTimeout.ts` | 请求超时 (30s)             |
| `expressRateLimit` | 多个限流器                                          | 多级限流 (计算/管理/认证)  |

### 7.5 关键 Zustand Store

| Store            | 位置                                            | 职责                  |
| ---------------- | ----------------------------------------------- | --------------------- |
| `authStore`      | `packages/frontend/src/store/authStore.ts`      | 认证 + 多租户 (267行) |
| `backtestStore`  | `packages/frontend/src/store/backtestStore.ts`  | 回测状态 (4 slice)    |
| `portfolioSlice` | `packages/frontend/src/store/portfolioSlice.ts` | 投资组合管理          |
| `cashflowSlice`  | `packages/frontend/src/store/cashflowSlice.ts`  | 现金流管理            |
| `executionSlice` | `packages/frontend/src/store/executionSlice.ts` | 执行状态管理          |

### 7.6 关键路由组

| 路由组        | 位置                                             | 路由数 | 权限   |
| ------------- | ------------------------------------------------ | :----: | ------ |
| ToolRoutes    | `packages/frontend/src/routes/index.tsx`         |   18   | 公开   |
| AuthRoutes    | `packages/frontend/src/routes/AuthRoutes.tsx`    |   4    | 未认证 |
| PublicRoutes  | `packages/frontend/src/routes/PublicRoutes.tsx`  |   7    | 公开   |
| AccountRoutes | `packages/frontend/src/routes/AccountRoutes.tsx` |   3    | 认证   |
| AdminRoutes   | `packages/frontend/src/routes/AdminRoutes.tsx`   |   4    | 管理员 |

### 7.7 关键配置文件

| 文件                  | 行数 | 职责                                     |
| --------------------- | :--: | ---------------------------------------- |
| `vitest.workspace.ts` | 223  | 测试配置 (4 项目 + 覆盖阈值)             |
| `vite.config.ts`      | 186  | 构建配置 (React + Federation + Tailwind) |
| `eslint.config.js`    | 152  | ESLint 9 扁平配置 (复杂度/i18n/Prettier) |
| `docker-compose.yml`  | 861  | 19 服务编排                              |
| `nodemon.json`        |  10  | 开发热重载                               |
| `turbo.json`          |  25  | Turborepo 管道                           |

---

## 8. 关键源代码分析

### 8.1 后端核心流程: 回测请求处理链

```
客户端 → POST /api/v1/backtest/portfolio
  → app.ts: computeMiddleware (JWT + RBAC + Quota + Audit)
  → backtestRoutes.ts: 请求验证 (Zod schema)
  → 同步路径: callGoEngine() → Go Engine → 返回结果
  → 异步路径: BullMQ 入队 → Worker 消费 → Go Engine → 结果存储
  → WebSocket 推送进度 (backtestWs.ts)
  → Response: { success, data, degraded?, degradedWarning? }
```

### 8.2 数据查询退化链 (dataFacade.ts)

```
fetchHistoryData(tickers, startDate, endDate)
  ├── validateTickers(tickers) → { valid, invalid, unknown }
  ├── queryPricesFromDb(valid, start, end)
  │   ├── PostgreSQL 可用 → 查询 prices 表
  │   └── PostgreSQL 熔断 → 返回 degraded=true
  ├── 缺失标的 → readCache() → 缓存命中 → 返回
  └── 缓存未命中 → fetchMissingFromGoService()
      ├── 信号量 (semaphore=10) → 并发调用 Go 数据服务
      ├── 写入缓存 (writeCache)
      └── 返回数据 + degraded 状态
```

### 8.3 JWT 认证链 (jwtAuth.ts)

```
JWT 认证流程:
  Authorization: Bearer <token>
  → 解析 Token (jose)
  → HS256: 从 JWT_SECRET 派生密钥
  → RS256: 从 JWKS 端点获取公钥
  → 验证签名 + 过期时间
  → 提取 payload: { sub, orgId, role, permissions }
  → 注入 req.user / req.orgId
  → 刷新令牌轮换 (tokenRotation.ts)
  → 失败 → 401 Problem Detail
```

### 8.4 引擎计算入口 (backtest.go)

```
RunBacktest(req BacktestRequest) → BacktestResult
  1. 解析交易日 (从 PriceData 提取并排序)
  2. 按日期范围过滤
  3. 收集所有资产代码
  4. 计算基准增长曲线 (computeBenchmarkGrowth)
  5. 对每个组合:
     a. 计算增长曲线 (含再平衡/现金流/滑点)
     b. 计算回撤曲线
     c. 计算回撤事件
     d. 计算统计指标 (CAGR/Sharpe/Sortino/VaR/...)
     e. 计算滚动收益
     f. 计算年/月度收益
  6. 计算组合间相关性矩阵
  7. 计算资产间相关性矩阵
  8. 可选: 确定性 SHA-256 指纹
```

### 8.5 蒙特卡洛模拟 (montecarlo.go)

```
RunMonteCarlo(req MonteCarloRequest) → MonteCarloResult
  1. 默认参数: 1000 次模拟, 20 年, 块大小 1-5 年
  2. 计算组合日收益率 (加权平均 + 拖累)
  3. 并行模拟 (goroutine):
     a. 随机抽样块
     b. 生成路径
     c. 计算路径指标
  4. 计算百分位数 (5/25/50/75/95)
  5. 计算成功概率 (3 种类型)
  6. 计算最终分布直方图
  7. 计算代表性路径 (最差/中位/最佳)
```

### 8.6 优化器 (optimizer.go)

```
Optimize(req OptimizeRequest) → OptimizationResult
  1. 计算收益率-协方差矩阵 (gonum/mat)
  2. 确保正定矩阵 (修正非正定)
  3. 随机搜索 + 拉格朗日求解器
  4. 支持目标: minVolatility / maxSharpe / maxReturn
  5. 返回最优权重 + 统计指标

ComputeEfficientFrontier(req FrontierRequest) → []FrontierPoint
  1. 计算 N 个有效前沿点 (默认 20)
  2. 拉格朗日乘子法
  3. N ≤ 15: 子集枚举保证全局最优
  4. N > 15: 线性插值回退
```

---

## 9. 确认问题清单

### 🔴 高优先级

#### P1. 未完成的 PoC 存根 (3 处)

**文件**: `engine-go/internal/server/grpc/server.go:15`, `packages/frontend/src/hooks/useBacktestWsXState.ts:16`, `packages/backend/src/utils/grpcClient.ts:11`

**问题**: 三个文件标记为 `NOTE: PoC stub` / `skeleton`，但已合入主分支。gRPC 服务器和 XState WebSocket Hook 均为不完整实现。

**影响**: 低 (未对外暴露)，但不符合代码规范。

#### P2. 高耦合服务文件

**文件**: `packages/backend/src/application/backtest-service.ts` (16 imports, 13 相对导入)

**问题**: 该文件直接依赖 16 个模块，包括数据门面、引擎客户端、各领域服务、仓库、事件分发器等。违反了单一职责原则。

**影响**: 中。修改者需理解所有依赖关系，测试时需 mock 大量依赖。

#### P3. 未等待的 Promise 模式

**文件**: `packages/backend/src/infrastructure/dataQuery.ts:307`, `packages/backend/src/domain/events/EventDispatcher.ts:78`

**问题**: 使用 `.map(async ...)` 但未等待 Promise 完成。`dataQuery.ts` 中 `stillMissing.map(async (ticker) => {...})` 的结果被 `Promise.all()` 捕获，但 `EventDispatcher.ts` 中 `handlers.map(async (handler) => {...})` 的结果未被等待。

**影响**: `EventDispatcher.ts` 中高。领域事件处理可能并发执行但未被 await，可能导致事件处理顺序不确定或未完成处理。

#### P4. WebSocket 错误静默吞没

**文件**: `packages/backend/src/services/backtestWs.ts:115-116`

**问题**: `.catch(() => undefined)` 静默吞没所有错误，不记录日志。

**影响**: 中。WebSocket 错误可能被忽略，导致调试困难。

### 🟡 中优先级

#### P5. 28 个超大文件 (≥300 行)

**代表性文件**:

- `packages/backend/src/infrastructure/dataQuery.ts` (577 行)
- `packages/backend/src/db/marketStats.ts` (481 行)
- `packages/backend/src/routes/backtestRoutes.ts` (454 行)
- `packages/backend/src/utils/metrics.ts` (450 行)
- `packages/backend/src/infrastructure/dataCache.ts` (413 行)
- `packages/backend/src/repositories/apiKeyRepo.ts` (409 行)

**问题**: 这些文件超过 ESLint 配置的 `max-lines-per-function: 80` 限制，且大多无显式函数声明（使用箭头函数或方法链），可读性和可维护性差。

**影响**: 中。重构优先级较高，至少 7 个后端文件超过 400 行。

#### P6. 重复的 `Math.floor(Date.now() / 1000)` 模式 (13 处)

**文件**: 分布在 `packages/backend/src/` 多个文件中

**问题**: 13 处重复 `Math.floor(Date.now() / 1000)` 代码，应提取为共享工具函数 `unixTimestamp()`。

**影响**: 低。代码重复但无功能影响。

#### P7. 不一致的 null 比较风格 (63 处)

**问题**: 混合使用 `=== null`, `!== null`, `== null`, `!= null`，无统一标准。

**影响**: 低。`== null` 故意检查 `null` 和 `undefined`，但风格不统一。

#### P8. 前端 `SortableTable` 使用 `any` 类型

**文件**: `packages/frontend/src/components/SortableTable.tsx:42,68`

**问题**: `Record<string, any>` 破坏了类型安全。

**影响**: 低。有 eslint-disable 注释说明理由。

### 🟢 低优先级

#### P9. 开发环境默认密钥

**文件**: `packages/backend/src/config/engineConfig.ts`, `authConfig.ts`, `databaseConfig.ts`

**问题**: 默认值如 `'dev-engine-auth-token'`, `'dev-only-jwt-secret-change-in-production'`, `'postgresql://backtest:backtest@localhost:5432/backtest'`。

**缓解**: 有 `assertNoDefaultSecrets.ts` 在生产环境校验。

#### P10. 3 个 `console.log/error` 调用

**文件**: `scripts/generate-openapi.ts:38`, `packages/frontend/src/utils/errorReporter.ts:80`, `packages/backend/src/config/assertNoDefaultSecrets.ts:57`

**问题**: 生产环境可能输出日志。

**缓解**: 均有 eslint-disable 注释，且为脚本/开发工具。

---

## 10. 疑似问题清单

### 🟡 需进一步调查

#### S1. 领域事件处理器并发问题

**位置**: `packages/backend/src/domain/events/EventDispatcher.ts:78`

**代码**: `handlers.map(async (handler) => {...})` 的结果未被 await 或 `Promise.all`。

**怀疑**: 领域事件处理器可能并发执行，但事件处理顺序可能不可预测。如果多个处理器修改同一资源，可能导致竞态条件。

**建议**: 确认事件处理器是否应为串行执行（顺序依赖）或确实需要并行（无顺序依赖）。如果是并行，应使用 `Promise.allSettled()` 并记录失败。

#### S2. 数据缓存可能的内存泄漏

**位置**: `packages/backend/src/infrastructure/dataCache.ts` (413 行)

**怀疑**: 缓存实现可能使用内存 Map 作为缓存存储，长时间运行可能导致内存泄漏。

**建议**: 确认缓存实现是否使用 Redis 作为后端存储。如果是内存缓存，需确认是否有 TTL 和大小限制。

#### S3. .map(async ...) 在 dataQuery.ts 中的 Promise 处理

**位置**: `packages/backend/src/infrastructure/dataQuery.ts:307`

**代码**: `stillMissing.map(async (ticker) => {...})` 传递给 `Promise.all(goPromises)`。

**影响**: 并发请求 Go 数据服务可能达到信号量限制 (10)。大量缺失标的时，所有请求同时发出，信号量只控制 HTTP 请求，不控制 Promise 创建。

**建议**: 确认 `callGoDataService()` 内部的信号量是否确实控制了并发。如果信号量生效，大量 Promise 将同时等待，但只有 10 个会同时进行 HTTP 请求。

#### S4. Go 服务限流与熔断器交互

**位置**: `data-fetcher/internal/provider/registry.go`

**怀疑**: 数据源降级链中，熔断器 (gobreaker) 和限流器 (ulule/limiter) 的交互可能导致状态不一致。

**建议**: 确认熔断器打开后，限流器是否仍允许探测请求通过（half-open 状态）。

#### S5. 前端组件未测试覆盖率

**问题**: 前端组件测试仅 5 个文件 (~300 行)，覆盖了 `chart-card`, `error-boundary`, `protected-route`, `statistics-table`, `ticker-input`。大量组件 (40+) 无测试。

**覆盖范围**: 仅 `store/`, `hooks/`, `utils/` 在覆盖率配置中，组件未纳入覆盖率统计。

**建议**: 确认组件测试策略。当前覆盖率配置仅包含 `store/**`, `hooks/**`, `utils/**`，组件被排除在外。

#### S6. 国际化 (i18n) 完整性

**怀疑**: 中英文双语可能存在翻译缺失或不同步。

**建议**: 运行 ESLint 的 i18n 规则（已配置）检查是否有中文硬编码在 `.tsx` 文件中。确认所有用户可见文本均已国际化。

#### S7. OpenAPI 规范与实际 API 的一致性

**怀疑**: `docs/openapi.yaml` 可能与实际路由/请求/响应格式不一致。

**建议**: 契约测试 (`tests/contract/openapi.contract.test.ts`) 覆盖率为 `>=95%`，但需确认是否覆盖所有端点。

---

## 11. 改进建议

### 按优先级排序

#### 立即执行 (P0)

1. **修复 EventDispatcher 未等待的 Promise**: 将 `handlers.map(async ...)` 改为 `await Promise.all(handlers.map(...))` 或 `Promise.allSettled()`。
2. **为 WebSocket 错误添加日志**: 将 `.catch(() => undefined)` 替换为 `.catch((err) => logger.error({ err }, '[ws] ...'))`。

#### 短期 (1-2 周)

3. **提取 `unixTimestamp()` 工具函数**: 消除 13 处重复 `Math.floor(Date.now() / 1000)`。
4. **拆分超大文件**: 优先处理 `dataQuery.ts` (577 行)、`dataCache.ts` (413 行)、`apiKeyRepo.ts` (409 行)。
5. **统一 null 比较风格**: 制定团队规范，统一使用 `=== null` / `!== null` 或 `== null` / `!= null`。
6. **删除或完成 PoC 存根**: 删除 `grpc/` 存根、`useBacktestWsXState.ts` 存根、`grpcClient.ts` 存根，或完成实现。

#### 中期 (1-2 月)

7. **降低 `backtest-service.ts` 耦合度**: 提取依赖注入或将服务拆分为多个小型服务。
8. **增加前端组件测试**: 覆盖核心组件 (PortfolioEditor, StatisticsTable, ErrorBoundary, Charts)。
9. **完善 OpenAPI 规范**: 确保所有端点有对应的 OpenAPI 定义。
10. **增加属性测试覆盖**: 当前仅 2 个属性测试文件，可扩展到统计计算、数据验证等。
11. **增加混沌测试覆盖**: 当前 5 个实验，可扩展到更多故障场景。

#### 长期 (3-6 月)

12. **考虑迁移到更现代的框架**: Express 4 基础上可评估 Fastify 或 Hono 的性能优势。
13. **完善 gRPC 支持**: 如果 Go 引擎需要更高性能的通信方式。
14. **前端性能优化**: 大型组件懒加载、代码分割、虚拟列表。
15. **数据库迁移自动化**: 当前 27 个迁移手动管理，可考虑自动迁移工具。

---

## 附录 A: 文件规模统计 (Top 30)

| 文件                                                                   | 行数  | 语言 |
| ---------------------------------------------------------------------- | :---: | :--: |
| `packages/backend/src/schemas/openapi-registry.ts`                     | 1,060 |  TS  |
| `packages/frontend/src/pages/tactical/TacticalParams.tsx`              |  594  | TSX  |
| `packages/backend/src/infrastructure/dataQuery.ts`                     |  577  |  TS  |
| `packages/backend/src/db/marketStats.ts`                               |  481  |  TS  |
| `packages/backend/src/routes/backtestRoutes.ts`                        |  454  |  TS  |
| `packages/backend/src/utils/metrics.ts`                                |  450  |  TS  |
| `packages/backend/src/application/auditStorageService.ts`              |  450  |  TS  |
| `packages/backend/src/infrastructure/outboxPublisher.ts`               |  432  |  TS  |
| `packages/frontend/src/hooks/useBacktestWs.ts`                         |  426  |  TS  |
| `packages/backend/src/infrastructure/dataCache.ts`                     |  413  |  TS  |
| `packages/backend/src/repositories/apiKeyRepo.ts`                      |  409  |  TS  |
| `packages/frontend/src/components/portfolioEditor/PortfolioCard.tsx`   |  407  | TSX  |
| `packages/frontend/src/pages/monte-carlo/MonteCarloParams.tsx`         |  405  | TSX  |
| `packages/backend/src/routes/webhookRoutes.ts`                         |  395  |  TS  |
| `packages/frontend/src/components/PortfolioEditor.tsx`                 |  387  | TSX  |
| `packages/frontend/src/components/charts/CorrelationHeatmapChart.tsx`  |  381  | TSX  |
| `packages/frontend/src/pages/account/PricingPage.tsx`                  |  374  | TSX  |
| `packages/frontend/src/pages/optimizer/OptimizerParams.tsx`            |  373  | TSX  |
| `packages/backend/src/application/webhookService.ts`                   |  372  |  TS  |
| `packages/backend/src/routes/authRoutes.ts`                            |  355  |  TS  |
| `packages/frontend/src/pages/tactical/TacticalGridResults.tsx`         |  351  | TSX  |
| `packages/backend/src/repositories/rbacRepo.ts`                        |  345  |  TS  |
| `packages/backend/src/application/backtest-helpers.ts`                 |  340  |  TS  |
| `packages/shared/types/statistics.ts`                                  |  336  |  TS  |
| `packages/backend/src/application/backtest-service.ts`                 |  335  |  TS  |
| `packages/frontend/src/pages/rebalancing-sensitivity/ResultsPanel.tsx` |  336  | TSX  |
| `packages/frontend/src/pages/account/AccountPage.tsx`                  |  332  | TSX  |
| `engine-go/internal/engine/tactical/backtest.go`                       |  331  | TSX  |
| `engine-go/internal/analysis/analysis.go`                              |  327  | TSX  |
| `engine-go/internal/goaloptimizer/goaloptimizer.go`                    |  322  | TSX  |

## 附录 B: 端口分配总表

| 服务                  |     端口     |   协议    |
| --------------------- | :----------: | :-------: |
| Frontend (Vite 开发)  |    15173     |   HTTP    |
| Frontend (Nginx 生产) |      80      |   HTTP    |
| Express API           | 15001 / 5001 | HTTP + WS |
| Go Engine             | 15004 / 5004 |   HTTP    |
| Go Data Service       | 15003 / 5003 |   HTTP    |
| PostgreSQL            | 15442 / 5432 |    TCP    |
| PostgreSQL 副本       |     5433     |    TCP    |
| Redis                 | 16381 / 6379 |    TCP    |
| Redis Sentinel        | 26379-26381  |    TCP    |
| Prometheus            |     9090     |   HTTP    |
| Alertmanager          |     9093     |   HTTP    |
| Grafana               |     3000     |   HTTP    |
| Uptime Kuma           |     3001     |   HTTP    |
| MinIO                 | 9000 / 9001  |   HTTP    |
| Kafka                 |     9092     |    TCP    |
| Zookeeper             |     2181     |    TCP    |
| Debezium Connect      |     8083     |   HTTP    |
| APISIX                | 9080 / 9443  |   HTTP    |
| APISIX Admin          |     9091     |   HTTP    |
| Unleash               |     4242     |   HTTP    |
| PostgreSQL Exporter   |     9187     |   HTTP    |
| Redis Exporter        |     9121     |   HTTP    |

## 附录 C: 依赖关系图 (简化)

```
shared (类型定义, 零依赖)
  ├── frontend (React SPA)
  │     └── 依赖: shared, react, recharts, zustand, i18next
  └── backend (Express API)
        ├── 依赖: shared, express, pg, ioredis, zod, jose, bullmq, stripe, opossum
        ├── → Go Engine (HTTP)
        └── → Go Data Service (HTTP)

go-shared (otel/日志/中间件, 零外部依赖)
  ├── engine-go (Gin + gonum)
  │     └── 依赖: go-shared, gin, gonum, otelgin
  └── data-fetcher (Gin + pgx)
        └── 依赖: go-shared, gin, pgx, gobreaker, ulule/limiter

api-client (自动生成 SDK)
  └── 依赖: shared
```

---

_报告结束。生成工具: opencode + 手动分析。建议定期 (每季度) 更新此报告以跟踪代码库演进。_
