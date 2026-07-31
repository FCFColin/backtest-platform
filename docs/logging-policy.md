# 日志级别策略（T-B1）

> 实现：`packages/backend/src/utils/logger.ts`（pino）；生产 JSON，开发 pretty。

## 级别

| 级别  | 场景                   | 示例                        |
| ----- | ---------------------- | --------------------------- |
| DEBUG | 开发诊断（非生产默认） | SQL 参数、缓存命中          |
| INFO  | 正常业务事件           | 请求完成、回测启动/完成     |
| WARN  | 可恢复异常、降级       | 熔断 Open、引擎降级         |
| ERROR | 需人工介入             | 未捕获异常、outbox 写入失败 |
| FATAL | 进程无法继续（少用）   | 致命启动失败                |

## 必填字段

`request_id`（pino-http）、`trace_id`/`span_id`（OTel）、`user_id`（jwtAuth 脱敏 hash 前 16 位）、`role`、`module`（子 logger）、`audit: true`。

## HTTP 请求日志

4xx → warn；5xx/未捕获 → error；其余 → info。脱敏（redact）: `authorization`、`x-api-key`、`password`、`token`、`secret`。
