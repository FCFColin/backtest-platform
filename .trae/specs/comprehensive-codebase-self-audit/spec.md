# 代码库全面深入自检 Spec

## Why
回测平台已演进为多语言微服务架构（React 前端 + Express/TS 后端 + Rust 引擎 + Go 数据服务 + Python 工具），代码量与复杂度显著增长。为在功能持续迭代过程中守住质量、安全与运行时稳定性三条底线，需对代码库进行一次系统性的全面深入自检，识别潜在缺陷、安全漏洞与难以通过静态分析定位的运行时问题，并形成可追踪的整改清单。

## What Changes
- 对后端 API 层（routes / middleware / services / engine / db / queues / utils）执行代码质量审查，输出结构化问题清单。
- 对全代码库执行安全扫描，聚焦鉴权、输入校验、密钥处理、注入、敏感数据暴露等可利用漏洞。
- 对静态分析难以定位的高风险运行时问题（降级链、并发/队列、引擎计算、缓存一致性等）启动证据驱动调试流程，形成假设→插桩→证据→结论的闭环。
- 汇总三类自检结果，按严重度排序，形成统一整改清单与修复优先级建议。
- **BREAKING**：自检过程中发现的高危安全漏洞与关键正确性缺陷，将在用户确认后进入修复阶段，可能涉及接口签名或行为变更。

## Impact
- Affected specs: 无既有 spec（本次为首次建立 spec-driven 流程）。
- Affected code:
  - 后端核心：[api/routes/](file:///d:/Project/回测平台/api/routes)、[api/middleware/](file:///d:/Project/回测平台/api/middleware)、[api/services/](file:///d:/Project/回测平台/api/services)、[api/engine/](file:///d:/Project/回测平台/api/engine)、[api/db/](file:///d:/Project/回测平台/api/db)、[api/queues/](file:///d:/Project/回测平台/api/queues)、[api/utils/](file:///d:/Project/回测平台/api/utils)
  - 入口与配置：[api/app.ts](file:///d:/Project/回测平台/api/app.ts)、[api/index.ts](file:///d:/Project/回测平台/api/index.ts)、[api/config/](file:///d:/Project/回测平台/api/config)
  - 前端关键：[src/utils/apiClient.ts](file:///d:/Project/回测平台/src/utils/apiClient.ts)、[src/store/](file:///d:/Project/回测平台/src/store)、[src/pages/](file:///d:/Project/回测平台/src/pages)
  - Go 数据服务：[data-fetcher/main.go](file:///d:/Project/回测平台/data-fetcher/main.go)
  - Python 工具：[api/python/](file:///d:/Project/回测平台/api/python)

## ADDED Requirements

### Requirement: 代码质量审查（TRAE-code-review）
系统 SHALL 对后端 API 层全部 TypeScript 模块执行结构化代码审查，覆盖正确性、错误处理、资源管理、并发与最佳实践，输出含位置、建议、严重度的问题清单，并经子代理交叉验证。

#### Scenario: 审查范围确定
- **WHEN** 启动代码质量审查
- **THEN** 覆盖 api/ 下 routes、middleware、services、engine、db、queues、utils 全部 .ts 文件，以及 api/app.ts、api/index.ts、api/server.ts 入口

#### Scenario: 问题交叉验证
- **WHEN** 主审查识别出候选问题
- **THEN** 派发 2 个子代理并行独立验证每个问题的存在性与严重度，仅保留 2/2 或 1/2 确认的问题

#### Scenario: 输出格式
- **WHEN** 验证完成
- **THEN** 以表格形式输出（编号 / 问题标题 / 建议 / 代码链接），按严重度降序排列

### Requirement: 安全漏洞扫描（TRAE-security-review）
系统 SHALL 对全代码库执行安全扫描，仅报告可端到端溯源、置信度 ≥ 0.80 的可利用漏洞，覆盖 SQL 注入、命令注入、路径穿越、鉴权/授权缺陷、弱密码学、不安全反序列化、敏感数据暴露等类别。

#### Scenario: 扫描范围
- **WHEN** 启动安全扫描
- **THEN** 覆盖 api/、src/、data-fetcher/、api/python/ 全部源码，以 git diff 或全量代码为输入

#### Scenario: 证据要求
- **WHEN** 报告一个漏洞
- **THEN** 必须同时给出攻击者可控输入入口（source）与危险汇聚点（sink），以及路径上是否存在绕过/净化

#### Scenario: 置信度门槛
- **WHEN** 候选漏洞置信度 < 0.80
- **THEN** 丢弃该候选，不进入最终报告

#### Scenario: 硬排除项
- **WHEN** 命中可用性/DoS、依赖过期、文档、测试代码、日志中非密钥用户输入等场景
- **THEN** 不报告

### Requirement: 运行时证据驱动调试（TRAE-debugger）
系统 SHALL 对静态分析难以定位的高风险运行时问题启动证据驱动调试流程，遵循"假设→插桩→复现→分析→最小修复→验证"科学方法，禁止在获取运行时证据前修改业务逻辑。

#### Scenario: 调试目标选择
- **WHEN** 静态审查发现疑似运行时缺陷（降级链失效、队列死锁、引擎数值错误、缓存不一致等）
- **THEN** 为每个目标生成语义化 sessionId，创建 debug-<sessionId>.md 记录

#### Scenario: 证据门槛
- **WHEN** 进入调试流程
- **THEN** 首次代码变更必须是插桩日志（网络上报至 Debug Server），而非业务逻辑修复

#### Scenario: 用户确认门槛
- **WHEN** 修复后请求用户确认
- **THEN** 必须提供 pre-fix 与 post-fix 日志对比证据，用户未确认前禁止清理调试产物

### Requirement: 自检结果汇总与优先级
系统 SHALL 将三类自检结果汇总为统一整改清单，按"高危安全 > 关键正确性 > 运行时稳定性 > 代码质量"排序，每项含位置、根因、建议、预估影响范围。

#### Scenario: 汇总输出
- **WHEN** 三类自检完成
- **THEN** 产出统一整改清单，并在 tasks.md 中为每项高/中危问题创建对应修复任务

## MODIFIED Requirements
无（首次建立 spec）。

## REMOVED Requirements
无。
