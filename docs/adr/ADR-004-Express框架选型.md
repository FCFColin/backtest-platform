# ADR-004: Express 框架选型

> **企业理由**：API 网关层的核心职责是路由调度和降级编排，不是性能极限。Express 的生态成熟度和中间件丰富度直接降低开发成本，而其性能瓶颈（相比 Fastify）在本项目中不构成约束——计算密集型任务已由 Rust 引擎承担。

| 字段     | 值                                   |
| -------- | ------------------------------------ |
| 状态     | 已接受                               |
| 日期     | 2025-01-15                           |
| 决策者   | 架构组                               |
| 范围     | Node API 层                          |

## Context（背景和驱动力）

Node API 层（`api/` 目录）作为回测平台的 API 网关，职责包括：

1. **路由管理**：15+ 个路由模块（backtest、optimizer、pca、signal、letf、admin 等）。
2. **中间件编排**：认证（API Key）、CORS、helmet 安全头、速率限制、请求日志、Prometheus 指标采集。
3. **降级调度**：Rust 引擎不可用时自动降级到 Node.js 备用引擎。
4. **前端托管**：生产环境托管 React SPA 构建产物。

评估的候选框架：

| 框架      | npm 周下载量 | TypeScript 支持 | 中间件生态     | 性能（req/s） |
| --------- | ------------ | --------------- | -------------- | ------------- |
| Express 4 | ~30M         | @types/express  | 最丰富         | ~15K          |
| Fastify 5 | ~3M          | 原生            | 较丰富         | ~60K          |
| NestJS    | ~2M          | 原生            | 依赖 Express   | ~15K          |

## Decision（决策内容）

选择 Express 4 作为 Node API 层框架。

### 选择理由

1. **中间件生态**：项目使用的所有中间件均有 Express 官方或社区适配：
   - `helmet`：HTTP 安全头
   - `cors`：跨域配置
   - `express-rate-limit`：速率限制
   - `pino-http`：请求日志
   - Fastify 需要使用 `@fastify/*` 系列替代，部分功能（如 opossum 熔断器的 Express 中间件集成）需自行适配。

2. **TypeScript 成熟度**：`@types/express` 维护良好，类型定义完整，与 tsx + ESM 配合无问题。

3. **性能非瓶颈**：Node API 层不做计算密集型任务（由 Rust 引擎承担），Express 的 ~15K req/s 完全满足需求（实际流量远低于此）。

4. **团队熟悉度**：Express 是 Node.js 生态中最广泛使用的框架，降低学习成本和招聘门槛。

### 排除 Fastify 的理由

- Fastify 的性能优势（4x）在本项目中无实际价值：API 层的瓶颈在 Rust 引擎调用（5s 超时），不在框架本身。
- 项目依赖的 `opossum`（熔断器）、`pino-http`（日志中间件）等库的 Express 集成更成熟。
- Fastify 的插件系统和生命周期钩子增加了概念复杂度，对简单路由场景过度设计。

### 排除 NestJS 的理由

- NestJS 底层仍使用 Express（默认），性能无提升。
- 装饰器 + 依赖注入的模式增加了样板代码，对 15 个路由模块的项目来说过度工程化。
- NestJS 的模块化体系与项目现有的平铺路由结构不匹配，迁移成本高。

## Consequences（后果）

### 正面

- **开发效率**：Express 中间件即插即用，路由定义简洁，15 个路由模块代码量可控。
- **生态兼容**：所有 npm 中间件无需适配层，helmet / cors / rate-limit 开箱即用。
- **TypeScript 友好**：`@types/express` 类型完整，与 tsx + ESM 模式配合无问题。
- **社区支持**：遇到问题可快速找到解决方案，Stack Overflow 答案丰富。

### 负面

- **性能上限**：Express 的请求处理速度（~15K req/s）低于 Fastify（~60K req/s），但在本项目中不构成瓶颈。
- **回调风格**：Express 的中间件基于 `(req, res, next)` 回调，不如 Fastify 的 async/await 原生支持优雅（但可通过 async wrapper 规避）。
- **框架老旧**：Express 4 的代码库较老，部分设计（如错误处理的 next(error) 模式）不如现代框架直观。
