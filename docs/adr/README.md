# ADR 索引

> 2026-08-13 重编号：有效 ADR 顺排为 ADR-001–015；废弃决策以 DADR- 前缀保留原编号追溯（原编号不再分配）。

## 当前有效 ADR（16 条）

| ADR     | 主题                                | 状态   |
| ------- | ----------------------------------- | ------ |
| ADR-001 | Express 框架选型                    | 已接受 |
| ADR-002 | PostgreSQL 迁移                     | 已接受 |
| ADR-003 | Go+TS 语言精简                      | 已接受 |
| ADR-004 | DDD 渐进式重构                      | 已接受 |
| ADR-005 | Outbox + LISTEN/NOTIFY + CDC        | 已接受 |
| ADR-006 | 可观测性(OTel + Pino + prom-client) | 已接受 |
| ADR-007 | JWT + RBAC + API Key                | 已接受 |
| ADR-008 | 单引擎 fail-closed 降级             | 已接受 |
| ADR-009 | 多租户 RLS + BFF 认证               | 已接受 |
| ADR-010 | Stripe 计费 + 配额                  | 已接受 |
| ADR-011 | 后端模块化                          | 已接受 |
| ADR-012 | 退役零消费者子系统与死配置旋钮      | 已接受 |
| ADR-013 | 退役死 schema                       | 已接受 |
| ADR-014 | 退役未实现引擎字段                  | 已接受 |
| ADR-015 | 退役 data-fetcher 独立 worker CLI   | 已接受 |
| ADR-016 | 移除零消费者认证与用户管理出口      | 已接受 |

## 已删除（废弃决策，DADR- 前缀，原编号保留追溯）

DADR-001(多语言, 被 ADR-003 取代), DADR-002(JSON 存储, 被 ADR-002 取代), DADR-003(Rust 引擎, 被 ADR-008 取代), DADR-005/006(SQLite, 被 ADR-002 取代), DADR-009-012(低价值合并), DADR-016(熔断器), DADR-018(Redis 高可用), DADR-019/026/033(合并到 ADR-007), DADR-020(Redis 降级, 合并到 DADR-018), DADR-023(数据隐私), DADR-024(强一致+幂等+重试边界, 合并到 ADR-005), DADR-028(重试与幂等边界, 合并到 ADR-005), DADR-034/035(合并到 ADR-009), DADR-037(配额计量与公平调度, 合并到 ADR-010), DADR-038(DR 策略), DADR-039/040/041(Proposed, 无文件), DADR-042(合并到 ADR-011), DADR-044(OTel SaaS 替换, 合并到 ADR-006), DADR-045(Redis 策略, 合并到 DADR-018), DADR-046(API 版本), DADR-050(Module Federation), DADR-051(CDC Debezium, 合并到 ADR-005), DADR-052(CI 分层), DADR-053(Node 层库)。
