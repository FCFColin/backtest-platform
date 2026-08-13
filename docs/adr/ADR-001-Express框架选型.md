# ADR-001: Express 框架选型

> **企业理由**：API 网关层的核心职责是路由调度和降级编排，不是性能极限。Express 的生态成熟度和中间件丰富度直接降低开发成本，而其性能瓶颈（相比 Fastify）在本项目中不构成约束——计算密集型任务已由 Go 引擎承担。

| 字段   | 值          |
| ------ | ----------- |
| 编号   | ADR-001     |
| 状态   | 已接受      |
| 日期   | 2025-01-15  |
| 决策者 | 架构组      |
| 范围   | Node API 层 |

## Context

Node API 层作为回测平台的 API 网关，职责包括路由管理（15+ 路由模块）、中间件编排（认证、CORS、helmet、速率限制、日志、Prometheus 指标）、降级调度（Go 引擎不可用时 fail-closed 503）、前端托管（生产环境托管 React SPA 构建产物）。

## Decision

选择 Express 4 作为 Node API 层框架。

**选择理由**：

1. 中间件生态最丰富——项目使用的所有中间件（helmet、cors、express-rate-limit、pino-http、opossum）均有 Express 官方或社区适配，无需自行适配
2. TypeScript 成熟度——@types/express 维护良好，与 tsx + ESM 配合无问题
3. 性能非瓶颈——API 层不做计算密集型任务（由 Go 引擎承担），Express 的 ~15K req/s 完全满足需求
4. 团队熟悉度——Node.js 生态中最广泛使用的框架，降低学习成本

放弃 Fastify：性能优势（4x）在本项目中无实际价值（瓶颈在 Go 引擎调用，不在框架本身）；opossum/pino-http 等库的 Express 集成更成熟。放弃 NestJS：底层仍使用 Express，性能无提升；装饰器+DI 模式对 15 个路由模块过度工程化。

## Consequences

- (+) 中间件即插即用，路由定义简洁，开发效率高
- (+) 所有 npm 中间件无需适配层，生态兼容性好
- (-) 性能上限低于 Fastify，但在本项目中不构成瓶颈
- (-) 中间件基于 (req, res, next) 回调，不如 async/await 原生支持优雅（可通过 async wrapper 规避）
