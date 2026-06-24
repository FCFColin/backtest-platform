# ADR-010: 熔断器策略

## Status: Accepted

## Context
微服务架构中，下游服务不可用时需快速失败避免级联故障。
不同服务（Go引擎、Rust引擎、PostgreSQL、Go数据服务）需独立熔断。

## Decision
- Node.js 服务：opossum 熔断器（Go引擎、Rust引擎、PostgreSQL 各独立实例）
- Go 服务：sony/gobreaker（BaoStock API 熔断）
- 熔断器配置：50% 失败率触发 Open，10s 后 HalfOpen 探测
- PostgreSQL 熔断器替代 dbAvailable 布尔标记，提供自动恢复能力

## Consequences
- 优势：自动恢复能力，避免 dbAvailable=false 后需人工重启
- 劣势：熔断器状态机增加调试复杂度
- 风险：HalfOpen 探测请求可能失败导致反复熔断
