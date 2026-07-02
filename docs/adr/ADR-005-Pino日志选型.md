# ADR-005: Pino 日志选型

> **企业理由**：日志是生产环境排障的唯一可靠依据。Pino 的结构化 JSON 输出和极低开销（比 winston 快 5-10 倍）确保日志不会成为性能瓶颈，同时 JSON 格式便于日志采集系统（ELK / Loki）消费和查询。

| 字段   | 值         |
| ------ | ---------- |
| 状态   | 已接受     |
| 日期   | 2025-01-20 |
| 决策者 | 架构组     |
| 范围   | 日志系统   |

## Context（背景和驱动力）

回测平台的日志需求：

1. **HTTP 请求日志**：每个请求的 method、url、statusCode、responseTime，按状态码分级（4xx=warn, 5xx=error）。
2. **业务日志**：Rust 引擎调用结果、降级事件、熔断器状态变更、数据服务调用结果。
3. **request_id 关联**：多服务日志通过 request_id 关联，支持分布式追踪。
4. **开发体验**：开发环境需要美化输出（颜色、时间格式），生产环境需要 JSON 格式。
5. **性能要求**：日志不能成为请求处理的热路径瓶颈。

评估的候选库：

| 维度          | pino           | winston         |
| ------------- | -------------- | --------------- |
| 性能（行/秒） | ~30,000        | ~3,000          |
| 输出格式      | JSON（原生）   | JSON / printf   |
| HTTP 中间件   | pino-http      | express-winston |
| 子 logger     | logger.child() | logger.child()  |
| 美化输出      | pino-pretty    | winston-console |
| Bundle 大小   | ~50KB          | ~200KB          |
| 维护状态      | 活跃           | 活跃            |

## Decision（决策内容）

选择 pino + pino-http + pino-pretty 作为日志方案。

### 配置详情

**通用 logger**（`api/utils/logger.ts`）：

```typescript
const logger = pino({
  level: isDev ? 'debug' : 'info',
  // 开发环境：pino-pretty 美化输出
  // 生产环境：JSON 格式，便于日志采集系统消费
});
```

**HTTP 请求日志**（pino-http 中间件）：

```typescript
const httpLogger = pinoHttp({
  logger: logger.child({ module: 'api' }),
  genReqId: (req) => {
    // 优先使用上游网关传递的 x-request-id
    const incoming = req.headers['x-request-id'];
    if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128) {
      return incoming;
    }
    return randomUUID();
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
```

### 选择理由

1. **性能**：pino 的同步写入 + 异步 flush 模式，单次日志调用耗时 < 1μs，winston 的格式化 + 传输链路耗时约 10μs。在高并发场景下，pino 不会成为性能瓶颈。
2. **结构化 JSON**：pino 原生输出 JSON，无需额外配置，直接适配 ELK / Loki 等日志采集系统。
3. **request_id 支持**：pino-http 的 `genReqId` 选项支持从请求头继承或自动生成 UUID，实现跨服务日志关联。
4. **子 logger**：`logger.child({ module: 'api' })` 为不同模块创建带标签的子 logger，便于日志过滤。
5. **开发体验**：pino-pretty 提供彩色输出和时间格式化，开发环境体验友好。

### 排除 winston 的理由

- **性能差距**：winston 的格式化管道（format.combine）和传输机制（Transport）引入额外开销，在高吞吐场景下可能成为瓶颈。
- **配置复杂**：winston 需要手动配置 format + transport，pino 的零配置 JSON 输出更简洁。
- **HTTP 集成**：express-winston 的 request_id 支持不如 pino-http 的 `genReqId` 灵活。

## Consequences（后果）

### 正面

- **零性能影响**：pino 的极低开销确保日志不会拖慢请求处理，即使在计算密集型降级场景下。
- **结构化输出**：JSON 格式日志可直接被 Loki / Elasticsearch 消费，支持字段级查询。
- **request_id 追踪**：跨服务日志通过 request_id 关联，排障时可快速定位请求全链路。
- **开发友好**：pino-pretty 的彩色输出和时间格式化让开发环境日志可读性高。

### 负面

- **pino-pretty 额外依赖**：开发环境需要安装 pino-pretty（~2MB），若未安装则回退到 JSON 输出。
- **JSON 可读性**：生产环境 JSON 日志不如文本格式直观，需要日志查看工具（jq / Loki）辅助。
- **社区规模**：pino 的 npm 周下载量（~5M）低于 winston（~10M），部分场景的社区解决方案较少。
