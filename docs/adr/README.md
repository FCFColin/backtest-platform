# ADR 索引

> 编号不可变, gaps 表示被取代/删除/合并的决策。

## 当前有效 ADR（19 条）

| ADR     | 主题                                | 状态   |
| ------- | ----------------------------------- | ------ |
| ADR-004 | Express 框架选型                    | 已接受 |
| ADR-007 | PostgreSQL 迁移                     | 已接受 |
| ADR-008 | Go+TS 语言精简                      | 已接受 |
| ADR-013 | DDD 渐进式重构                      | 已接受 |
| ADR-014 | Outbox + LISTEN/NOTIFY + CDC        | 已接受 |
| ADR-015 | 可观测性(OTel + Pino + prom-client) | 已接受 |
| ADR-016 | 熔断器 + 限流 fail-closed           | 已接受 |
| ADR-017 | JWT + RBAC + API Key                | 已接受 |
| ADR-018 | Redis + Sentinel HA                 | 已接受 |
| ADR-023 | 数据隐私 + GDPR + 生命周期          | 已接受 |
| ADR-031 | 单引擎 fail-closed 降级             | 已接受 |
| ADR-032 | 多租户 RLS + BFF 认证               | 已接受 |
| ADR-036 | Stripe 计费 + 配额                  | 已接受 |
| ADR-038 | 灾难恢复策略                        | 已接受 |
| ADR-046 | API 版本生命周期                    | 已接受 |
| ADR-047 | 后端模块化                          | 已接受 |
| ADR-050 | Module Federation 预留              | 已接受 |
| ADR-052 | CI 分层 + 供应链安全                | 已实施 |
| ADR-053 | Node 层库选型                       | 已接受 |

## 已删除（被取代/合并/低价值）

ADR-001(多语言, 被 008 取代), ADR-002(JSON 存储, 被 007 取代), ADR-003(Rust 引擎, 被 031 取代), ADR-005/006(SQLite, 被 007 取代), ADR-009-012(低价值合并), ADR-019/026/033(合并到 017), ADR-034/035(合并到 032), ADR-042(合并到 047), ADR-045(Redis 策略, 合并到 018)。
