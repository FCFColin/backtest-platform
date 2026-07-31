# ADR-053: Node 层核心库选型（Pino + Zod + BullMQ）

> **企业理由**：日志、运行时校验、异步任务队列是 Node API 层的三项基础能力。统一选型降低维护成本并保证请求入口安全与可用性。

| 字段   | 值                                                                             |
| ------ | ------------------------------------------------------------------------------ |
| 编号   | ADR-053                                                                        |
| 状态   | 已接受                                                                         |
| 日期   | 2026-07-29                                                                     |
| 决策者 | 架构组                                                                         |
| 范围   | Node API 层（日志 / 校验 / 异步任务）                                          |
| 合并   | 原 ADR-005（Pino 日志）、ADR-009（Zod 校验）、ADR-011（BullMQ 异步任务）已并入 |

## Context

Node API 层需要三项基础能力：结构化日志（生产排障依据）、运行时请求体校验（防止畸形请求绕过编译时检查）、CPU 密集型长任务异步化（避免阻塞事件循环）。

## Decision

### 1. 日志：Pino + pino-http + pino-pretty

选择 pino 而非 winston。pino 同步写入 + 异步 flush，单次日志调用 < 1us（winston 约 10us）；原生 JSON 输出直接适配 ELK/Loki；pino-http 的 genReqId 支持从请求头继承或自动生成 UUID 实现跨服务 request_id 关联；pino-pretty 提供开发环境彩色输出。Go 服务对应使用 slog。

### 2. 运行时校验：Zod

选择 zod 而非 joi/class-validator。TypeScript-first，z.infer 自动推导类型，无需维护两套类型定义；社区活跃度最高（30k+ stars）；支持联合类型、条件校验、transform；零运行时依赖，bundle 小。放弃 class-validator（装饰器与 Express 函数式路由不契合）、joi（类型推导不如 zod）。

### 3. 异步任务：BullMQ + Redis

选择 BullMQ + Redis 而非 pg-boss/自建。Node.js 生态最成熟的任务队列，支持优先级、重试（指数退避）、延迟、定时、并发控制；自带 Bull Board Dashboard；支持任务进度上报与取消。Redis 已在项目规划中（ADR-018），不引入新基础设施。放弃 pg-boss（性能不如 Redis，功能不完善）、自建（维护成本高）。

## Consequences

- (+) pino 极低开销确保日志不拖慢请求处理；结构化 JSON 便于采集与查询
- (+) zod 类型推导消除类型重复；请求入口非法数据被拦截
- (+) BullMQ 成熟稳定，覆盖所有任务调度场景；前端可实时展示进度
- (-) pino-pretty 额外依赖（~2MB，未安装回退 JSON）；生产 JSON 日志需工具辅助阅读
- (-) zod v4 升级可能带来 breaking change，需关注版本策略
- (-) BullMQ 引入 Redis 依赖，需保证 Redis 高可用（Sentinel，ADR-018）
