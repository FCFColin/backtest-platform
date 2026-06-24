对本项目进行第二轮深度自检审计。上一轮已覆盖基础安全修复、性能优化、代码 
 重构和技术选型调整。 
 
 【审计的根本目标】 
 本轮以"企业级工程实践学习"为核心目标——不是最快修完项目，而是： 
 1. 识别出所有"个人项目写法"和"企业级写法"之间的差距 
 2. 对每个差距，解释企业为什么这样做（业务原因/团队协作原因/运维原因） 
 3. 按企业标准实施改造，并在代码注释或文档中记录决策依据（Architecture Decision Record） 
 即使某些改造对当前项目规模"过度设计"，只要它是行业标准实践，就应实施并注明理由。 
 
 ━━━ 维度 A：系统设计与架构文档 ━━━ 
 - 是否有 README 以外的架构文档？请生成 docs/architecture.md，包含： 
   · 系统整体架构图（用 Mermaid 语法绘制，展示各组件关系和数据流） 
   · 所有关键技术选型的 ADR（Architecture Decision Record）条目： 
     为什么选这个数据库？为什么选这个框架？为什么用这种部署方式？ 
   · 当前系统的已知局限性和未来扩展点 
 - 从系统设计视角评估：如果流量增长 100 倍，当前架构在哪里会最先崩溃？ 
   给出具体的瓶颈分析和应对方案（读写分离/缓存层/队列解耦/水平扩展等）。 
 
 ━━━ 维度 B：企业级可观测性（Observability）三支柱 ━━━ 
 【Logs（日志）】 
 - 所有日志是否结构化（JSON格式）并包含 request_id、trace_id、耗时、用户上下文？ 
 - 是否在所有 error 日志中包含完整调用链（不泄露敏感信息的前提下）？ 
 - 是否有 audit log（对敏感操作——增删改——的不可篡改日志）？ 
 - 日志级别策略是否合理：DEBUG/INFO/WARN/ERROR/FATAL 各自的使用规范？ 
 
 【Metrics（指标）】 
 - 是否暴露 Prometheus 格式的 /metrics 端点？ 
 - 是否包含黄金信号（Golden Signals）： 
   · Latency（P50/P95/P99 延迟分布，而非平均值） 
   · Traffic（RPS，按接口维度） 
   · Errors（错误率，区分 4xx/5xx） 
   · Saturation（连接池使用率、goroutine数量、内存使用） 
 - 是否有业务指标（而非只有系统指标）？ 
 
 【Traces（链路追踪）】 
 - 是否集成 OpenTelemetry？这是当前行业标准，应该实施。 
 - 每个 HTTP 请求是否有完整的 span 覆盖（含 DB 查询、外部调用）？ 
 - trace_id 是否贯穿从请求入口到最终响应的完整链路，并可在日志中关联查找？ 
 
 ━━━ 维度 C：企业级弹性工程（Resilience Engineering）━━━ 
 - Circuit Breaker（熔断器）：对所有外部依赖（DB、第三方API）是否有熔断保护？ 
   企业场景下雪崩效应的标准防御方案是什么？对应到本项目应怎么实施？ 
 - Retry with Exponential Backoff + Jitter（退避重试）： 
   哪些操作应该重试？哪些绝对不能重试（非幂等操作）？当前代码是否区分了这两类？ 
 - Timeout 分层：连接超时、读超时、整体请求超时是否各自独立配置？ 
 - Graceful Degradation（优雅降级）：当某个功能不可用时，系统是否能返回降级响应而非直接报错？ 
 - Bulkhead（舱壁模式）：不同类型的请求是否有独立的资源池，防止一类请求拖垮整体？ 
 
 ━━━ 维度 D：企业级 CI/CD 与 DevSecOps ━━━ 
 - 如果当前没有 CI/CD 配置，生成完整的 .github/workflows/ 或等效配置文件，包含： 
   · lint（代码风格检查） 
   · test（单元测试 + 集成测试，含 go test -race） 
   · security scan（govulncheck 或 trivy 扫描依赖漏洞） 
   · container scan（扫描 Docker 镜像中的系统漏洞） 
   · build & push（生成不可变镜像，tag 为 git commit SHA，而非 latest） 
   · 自动生成变更日志或部署摘要 
 - 解释"shift-left security"理念：为什么安全检查要在 CI 而非上线后做？ 
 - 是否有 branch protection 规则建议（PR review、强制检查通过才可合并）？ 
 
 ━━━ 维度 E：企业级测试策略（Testing Trophy / Testing Pyramid）━━━ 
 - 当前测试覆盖率如何？用测试金字塔框架分析分布是否合理： 
   · 单元测试（Unit）：纯函数逻辑，无外部依赖 
   · 集成测试（Integration）：含真实DB（testcontainers）、测试所有 SQL 路径 
   · 契约测试（Contract）：如果有多服务或前后端分离，API 契约是否被测试？ 
   · E2E 测试（End-to-End）：核心用户流程是否有端到端覆盖？ 
 - 是否有 Table-Driven Tests（Go惯用写法）覆盖边界条件和异常路径？ 
 - 是否有针对并发场景的竞态测试（go test -race）？ 
 - 是否有性能基准测试（go test -bench）用于防止性能回退？ 
 - 给出一份"测试欠债地图"：哪些核心路径完全没有测试，按风险排序。 
 
 ━━━ 维度 F：API 设计成熟度（API Design Maturity）━━━ 
 - 是否有 OpenAPI/Swagger 规格文档？这是企业团队协作的基础。 
   若无，生成完整的 openapi.yaml，包含所有端点、请求/响应 schema、错误码定义。 
 - 评估 API 版本化策略：当前是否有版本（/v1/...）？ 
   解释企业中为何从第一天就需要版本化，以及如何向后兼容地演进 API。 
 - 是否有统一的错误响应 envelope（如 RFC 7807 Problem Details for HTTP APIs）？ 
 - 是否有请求的幂等性保障（Idempotency Key）？哪些端点需要？ 
 - 评估分页策略：cursor-based 分页 vs offset 分页的企业级权衡是什么？ 
   当前实现适合什么规模？何时需要切换？ 
 - HTTP 语义是否正确： 
   · 读操作是否都是幂等的（GET/HEAD）？ 
   · 写操作是否正确区分了 PUT（全量替换）和 PATCH（部分更新）？ 
   · 202 Accepted（异步操作）、409 Conflict、422 Unprocessable Entity 等是否在适合场景使用？ 
 
 ━━━ 维度 G：企业级安全深度（Security Depth）━━━ 
 - 认证与授权（AuthN/AuthZ）： 
   · 当前是否有认证机制？如无，设计 JWT + Refresh Token 的完整方案（含 token 轮换、撤销列表）。 
   · 是否实现了 RBAC（Role-Based Access Control）或 ABAC？企业中哪种更常见？ 
   · 每个端点是否都明确声明了所需权限（而非默认允许）？ 
 - 威胁建模（Threat Modeling）： 
   对本项目做一次简化的 STRIDE 分析（Spoofing/Tampering/Repudiation/ 
   Information Disclosure/Denial of Service/Elevation of Privilege）， 
   列出每类威胁在本项目中的具体表现和缓解措施。 
 - 数据分类（Data Classification）： 
   哪些字段属于 PII（个人身份信息）？在存储和传输中是否有对应的保护措施？ 
   这在 GDPR/CCPA 合规场景下意味着什么？ 
 - 安全 HTTP 响应头是否完备（HSTS、X-Frame-Options、CSP、X-Content-Type-Options）？ 
 - Rate Limiting 是否按用户/IP/端点维度分别实施（而非全局一个限速）？ 
 
 ━━━ 维度 H：云原生与容器化最佳实践 ━━━ 
 - Dockerfile 是否满足： 
   · 多阶段构建（builder + 最小运行镜像） 
   · 使用 distroless 或 alpine 而非 ubuntu/debian 作为基础镜像 
   · 非 root 用户运行（USER nonroot） 
   · 明确 pin 所有基础镜像的 digest（而非 tag）防止供应链攻击 
   · .dockerignore 完备（排除 .git、测试文件、开发配置） 
 - Kubernetes 就绪（即使当前用 docker-compose，也要按 K8s 标准设计）： 
   · 是否有 liveness probe / readiness probe / startup probe？三者的区别和正确配置？ 
   · 资源 requests/limits 是否基于实测值设置？ 
   · 是否支持水平扩展（无状态设计、本地会话/缓存外移）？ 
   · 是否有 PodDisruptionBudget 考虑（滚动更新期间的可用性保障）？ 
 - 配置管理是否 12-Factor App 兼容（配置全走环境变量，绝不硬编码或提交到 VCS）？ 
 
 ━━━ 维度 I：数据库工程成熟度 ━━━ 
 - 数据库迁移管理： 
   · 所有 schema 变更是否都通过迁移文件管理（版本化、可回滚）？ 
   · 迁移文件是否包含 Up 和 Down 两个方向？ 
   · 迁移是否在 CI 中被测试（包括回滚测试）？ 
 - 索引策略： 
   · 是否有 EXPLAIN ANALYZE 的分析报告？慢查询是否都有索引覆盖？ 
   · 是否有复合索引，并正确考虑了索引列顺序（最左前缀原则）？ 
   · 是否有未使用的冗余索引影响写性能？ 
 - 数据完整性： 
   · 所有外键约束是否在 DB 层声明（而非只在应用层校验）？ 
   · 是否有 CHECK 约束防止业务非法状态？ 
   · 事务边界是否正确（最小化事务持有时间）？ 
 - 连接池配置是否经过压测验证（MaxOpenConns/MaxIdleConns/ConnMaxLifetime）？ 
 
 ━━━ 维度 J：工程文化与协作就绪（Team Engineering Readiness）━━━ 
 这一维度是个人项目最容易忽视、但在企业最重要的维度。 
 - CONTRIBUTING.md 是否存在？是否包含：本地开发环境搭建步骤、代码风格规范、PR 提交规范、commit message 格式（Conventional Commits）？ 
 - 是否有 .editorconfig 和 linter 配置（golangci-lint），确保团队代码风格一致？ 
 - 是否有 pre-commit hook（husky / git hooks）在提交前自动运行格式化和 lint？ 
 - 是否有 CHANGELOG.md（遵循 Keep a Changelog 规范）？ 
 - API 变更是否有 deprecation 策略（而非直接删除旧接口）？ 
 - 是否有 on-call runbook（docs/runbook.md）：列出最可能出现的5类故障和排查步骤？ 
   在企业中这是 SRE 的标配，练习编写它能让你理解系统的故障模式。 
 
 ━━━ 输出要求（分两阶段）━━━ 
 
 【阶段一：审计报告（先输出，等待确认再实施）】 
 产出 docs/audit-enterprise.md，包含： 
 
 1. 企业级差距矩阵 
    按上述 10 个维度（A-J），逐项评估： 
    ✅ 已达企业标准 | ⚠️ 部分达标（说明差距和补全方案）| ❌ 未达标（说明企业为何需要此项 + 具体修复方案） 
    每个发现必须引用具体文件名和行号。 
 
 2. 学习价值标注 
    对每个改造项，额外标注： 
    🎓 面试高频考点（系统设计面试/行为面试中会被问到） 
    💼 工作中每天用到（入职后第一周就会接触） 
    🔭 高级工程师技能（Senior/Staff 级别才做的事） 
    📋 行业标准规范（有对应的 RFC/标准文档） 
 
 3. 工具选型建议 
    对每个改造项，给出： 
    - 开源方案（免费，适合学习） 
    - 企业常用商业/SaaS 方案（面试时可以说"我了解企业中通常使用..."） 
    - 与 Go 生态的具体集成方式（库名 + 示例用法） 
 
 4. 优先级矩阵（按以下两个维度排序） 
    - 就业价值（面试中提到能加分的程度） 
    - 实施复杂度（Low/Medium/High） 
 
 【阶段二：实施规划】 
 产出 tasks-enterprise.md 和 checklist-enterprise.md（沿用上一轮格式）， 
 等待我明确批准后再开始实施。 
 实施时，每个改动必须在代码注释或对应文档中说明： 
 "为什么企业需要这个？" + "这里做了什么权衡？" 
 以便将来向面试官解释时有据可查。