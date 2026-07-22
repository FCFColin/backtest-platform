# ADR 索引

> 架构决策记录（ADR）编号是不可变标识符。被删除或合并的 ADR 编号不再复用， gaps 是正常的。

## 当前有效 ADR

| ADR                                                         | 决策                                                                     | 状态   | 落地状态                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ------------------------------------------------- |
| [ADR-004](ADR-004-Express框架选型.md)                       | Express 作为 API 框架                                                    | 已接受 | ✅ 已落地                                         |
| [ADR-005](ADR-005-Pino日志选型.md)                          | Pino 作为结构化日志库                                                    | 已接受 | ✅ 已落地                                         |
| [ADR-007](ADR-007-PostgreSQL迁移决策.md)                    | PostgreSQL 作为主数据库                                                  | 已接受 | ✅ 已落地                                         |
| [ADR-008](ADR-008-语言精简决策.md)                          | 精简为 Go + TypeScript                                                   | 已接受 | ✅ 已落地                                         |
| [ADR-009](ADR-009-请求体校验库选型.md)                      | Zod 作为运行时校验库                                                     | 已接受 | ✅ 已落地                                         |
| [ADR-011](ADR-011-长任务异步化方案.md)                      | BullMQ + Redis 异步任务                                                  | 已接受 | ✅ 已落地                                         |
| [ADR-012](ADR-012-SBOM与制品签名方案.md)                    | 供应链安全：SBOM + SLSA Provenance + cosign Keyless                      | 已接受 | ⚠️ 部分（cosign keyless 需 OIDC provider 配置）   |
| [ADR-013](ADR-013-领域模型重构策略.md)                      | 渐进式 DDD：Value Object → Aggregate → Domain Event                      | 已接受 | ⚠️ 部分（Run/Job 聚合根已落地，Phase 1-3 推进中） |
| [ADR-014](ADR-014-事件溯源Outbox方案.md)                    | PostgreSQL LISTEN/NOTIFY + Outbox 表                                     | 已接受 | ✅ 已落地                                         |
| [ADR-015](ADR-015-可观测性技术选型.md)                      | OpenTelemetry + pino + prom-client                                       | 已接受 | ✅ 已落地                                         |
| [ADR-016](ADR-016-熔断器策略.md)                            | opossum（Node）+ gobreaker（Go）熔断器                                   | 已接受 | ✅ 已落地                                         |
| [ADR-017](ADR-017-认证授权模型.md)                          | JWT + RBAC（3 角色 × 7 权限），x-api-key 兼容                            | 已接受 | ✅ 已落地                                         |
| [ADR-018](ADR-018-Redis选型.md)                             | Redis 用于 session/限流/缓存                                             | 已接受 | ✅ 已落地                                         |
| [ADR-019](ADR-019-异步任务越权防护与所有权模型.md)          | 任务归属提交者，越权校验                                                 | 已接受 | ✅ 已落地                                         |
| [ADR-020](ADR-020-限流fail-closed分级策略.md)               | 限流 fail-closed 分级策略（含全局 apiLimiter）                           | 已接受 | ✅ 已落地                                         |
| [ADR-023](ADR-023-数据隐私分类与删除权实现.md)              | 数据分类 + GDPR 删除权                                                   | 已接受 | ⚠️ 待落地（删除权 API 未实现）                    |
| [ADR-024](ADR-024-Outbox强一致与消费者幂等.md)              | Outbox 强一致 + 消费者幂等 + 重试边界                                    | 已接受 | ✅ 已落地                                         |
| [ADR-026](ADR-026-开发环境认证旁路安全边界.md)              | 开发环境认证旁路安全边界                                                 | 已接受 | ✅ 已落地                                         |
| [ADR-027](ADR-027-100x容量拐点与缓解.md)                    | 100x 容量瓶颈分析                                                        | 已接受 | 📋 分析文档                                       |
| [ADR-031](ADR-031-单引擎fail-closed降级.md)                 | Go 单引擎，不可用时 fail-closed 503                                      | 已接受 | ✅ 已落地                                         |
| [ADR-032](ADR-032-多租户RLS隔离模型.md)                     | PostgreSQL RLS 多租户隔离                                                | 已接受 | ✅ 已落地                                         |
| [ADR-033](ADR-033-按组织API密钥.md)                         | 按组织 API 密钥（哈希存储、可吊销）                                      | 已接受 | ✅ 已落地                                         |
| [ADR-034](ADR-034-服务端持久化与前端认证.md)                | 服务端持久化 + Refresh Token                                             | 已接受 | ✅ 已落地                                         |
| [ADR-035](ADR-035-自助注册与组织邀请.md)                    | 自助注册 + 邀请流程                                                      | 已接受 | ✅ 已落地                                         |
| [ADR-036](ADR-036-Stripe计费.md)                            | Stripe 计费集成                                                          | 已接受 | ✅ 已落地                                         |
| [ADR-037](ADR-037-配额计量与公平调度.md)                    | 月度配额计量 + 公平调度                                                  | 已接受 | ✅ 已落地                                         |
| [ADR-038](ADR-038-ci-tiering-and-dependency-enforcement.md) | CI 分层（required/optional）+ 依赖规则                                   | 已接受 | ✅ 已落地                                         |
| [ADR-042](ADR-042-api-packages-consolidation.md)            | API 包合并                                                               | 已接受 | ✅ 已落地                                         |
| [ADR-043](ADR-043-baostock-provider双通路职责分离.md)       | baostock 直连与 Provider Registry 双通路职责分离                         | 已接受 | ✅ 已落地                                         |
| [ADR-044](ADR-044-otel-saas-replacement.md)                 | OTel SaaS 替换（go-shared + `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量切换） | 已接受 | ✅ 已落地                                         |

## 已删除（被取代或低价值）

| 原 ADR  | 内容                              | 处理方式                                       |
| ------- | --------------------------------- | ---------------------------------------------- |
| ADR-001 | 多语言架构（Rust+Node+Go+Python） | 被 ADR-008 取代（精简为 Go+TS）                |
| ADR-002 | JSON 文件存储                     | 被 ADR-006 → ADR-007 取代（PostgreSQL）        |
| ADR-003 | Rust 主引擎 + Node 降级           | 被 ADR-008 + ADR-031 取代（Go 单引擎）         |
| ADR-006 | SQLite 迁移                       | 被 ADR-007 取代（PostgreSQL）                  |
| ADR-010 | gitleaks 密钥扫描工具选型         | 删除：工具配置非架构决策                       |
| ADR-021 | ESLint 复杂度量化门控             | 删除：lint 规则配置非架构决策                  |
| ADR-022 | SLSA 出处证明与全量 SBOM 治理     | 合并入 ADR-012（供应链安全统一决策）           |
| ADR-025 | 全局 apiLimiter fail-closed       | 合并入 ADR-020（限流分级策略统一决策）         |
| ADR-028 | 重试与幂等边界                    | 合并入 ADR-024（Outbox + 幂等 + 重试统一决策） |
| ADR-029 | Cursor 分页（暂不实现）           | 删除：未实施的探索性决策                       |
| ADR-030 | Distroless 评估（仅 PoC）         | 删除：仅 PoC 评估，无落地                      |
| ADR-039 | 运行时不变量断言                  | 删除：实现模式非架构决策                       |
| ADR-040 | 属性测试（fast-check）            | 删除：测试策略非架构决策                       |
| ADR-041 | 确定性指纹                        | 删除：实现细节非架构决策                       |

## 待落地优先级

| ADR     | 待落地项                                                            | 优先级 |
| ------- | ------------------------------------------------------------------- | ------ |
| ADR-012 | cosign keyless OIDC provider 配置                                   | P2     |
| ADR-023 | GDPR 删除权 API 实现                                                | P2     |
| ADR-013 | domain 层参与计算路径（当前仅 portfolioRepo 使用 Portfolio 聚合根） | P1     |
