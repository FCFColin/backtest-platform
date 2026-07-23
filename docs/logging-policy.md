# 日志级别策略（T-B1）

> 企业理由：统一级别规范避免「全 DEBUG」或「全 ERROR」导致排障噪音或遗漏。  
> 实现：`packages/backend/src/utils/logger.ts`（pino）；生产 JSON，开发 pretty。

## 级别定义

| 级别      | 使用场景             | 示例                                      |
| --------- | -------------------- | ----------------------------------------- |
| **DEBUG** | 开发诊断、非生产默认 | SQL 参数、缓存命中细节                    |
| **INFO**  | 正常业务事件         | 请求完成、回测启动/完成、迁移成功         |
| **WARN**  | 可恢复异常、降级     | 熔断 Open、引擎降级、Redis 回退           |
| **ERROR** | 需人工介入           | 未捕获异常、outbox 写入失败、启动校验失败 |
| **FATAL** | 进程无法继续（少用） | 保留给致命启动失败                        |

## 必填字段

| 字段                   | 来源                 | 说明                          |
| ---------------------- | -------------------- | ----------------------------- |
| `request_id`           | pino-http `genReqId` | 关联同一 HTTP 请求            |
| `trace_id` / `span_id` | OTel mixin           | 跳转 Tempo/Jaeger             |
| `user_id`              | jwtAuth 脱敏 hash    | 仅认证请求（SHA256 前 16 位） |
| `role`                 | JWT payload          | admin/analyst/readonly        |
| `module`               | 子 logger            | 如 `api`、`audit`             |
| `audit: true`          | auditLog             | 审计日志过滤                  |

## HTTP 请求日志

- 4xx → **warn**
- 5xx / 未捕获错误 → **error**
- 其余 → **info**

## 脱敏（redact）

见 `logger.ts`：`authorization`、`x-api-key`、`password`、`token`、`secret`。
