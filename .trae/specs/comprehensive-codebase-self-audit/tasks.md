# Tasks

## 阶段一：代码质量审查（TRAE-code-review）

- [x] Task 1: 确定代码质量审查范围并收集上下文
  - [x] SubTask 1.1: 枚举 api/ 下全部待审查 .ts 文件清单（routes/middleware/services/engine/db/queues/utils + 入口）
  - [x] SubTask 1.2: 读取每个文件完整内容，建立审查上下文
  - [x] SubTask 1.3: 识别项目既有安全/校验/错误处理基线模式，作为对比参照

- [x] Task 2: 执行代码质量主审查
  - [x] SubTask 2.1: 审查 routes 层（14 个路由文件）——参数校验、错误处理、降级调用、响应一致性
  - [x] SubTask 2.2: 审查 middleware 层（auth/jwtAuth/rbac/validate/auditLog/idempotency）——鉴权逻辑、绕过风险、中间件顺序
  - [x] SubTask 2.3: 审查 services 层（dataService/userService/engineService 等）——数据访问、事务、并发、资源释放
  - [x] SubTask 2.4: 审查 engine 层（13 个计算模块）——数值正确性、边界条件、NaN/Infinity 处理、数组越界
  - [x] SubTask 2.5: 审查 db/queues/utils——SQL 构造、队列生命周期、日志脱敏、错误工具
  - [x] SubTask 2.6: 审查入口 app.ts/index.ts/server.ts——中间件注册顺序、全局错误处理、优雅关闭

- [x] Task 3: 代码质量主审查结果交叉验证
  - [x] SubTask 3.1: 派发 2 个子代理并行独立验证全部候选问题的存在性与严重度
  - [x] SubTask 3.2: 按置信度（2/2 高 / 1/2 中 / 0/2 丢弃）过滤，输出最终问题表
  - 验证结论：14 个问题全部 2/2 确认存在；问题 9 经两验证员一致建议由 major 下调为 minor

## 阶段二：安全漏洞扫描（TRAE-security-review）

- [x] Task 4: 建立项目安全基线
  - [x] SubTask 4.1: 识别项目既有的校验器、转义器、ORM、鉴权中间件、密码学封装
  - [x] SubTask 4.2: 记录基线模式作为偏差检测对比标准

- [x] Task 5: 执行安全扫描三遍法
  - [x] SubTask 5.1: Pass A——项目安全基线梳理
  - [x] SubTask 5.2: Pass B——偏差映射，识别新代码是否绕过既有安全原语
  - [x] SubTask 5.3: Pass C——source-to-sink 追踪，对每个可疑点验证入口→边界→汇聚点完整链路

- [x] Task 6: 安全扫描结果过滤与输出
  - [x] SubTask 6.1: 应用置信度门槛（≥0.80）与硬排除规则
  - [x] SubTask 6.2: 按 HIGH/MEDIUM/LOW 分级输出漏洞表（含 source→sink 证据、位置、建议）
  - 结论：未发现可利用问题（项目安全基线完善，全代码库一致使用既有安全原语）

## 阶段三：运行时证据驱动调试（TRAE-debugger）

- [x] Task 7: 识别需运行时调试的高风险目标
  - [x] SubTask 7.1: 从阶段一/二结果中筛选静态分析难以定位的运行时问题（降级链、队列、数值、缓存）
  - [x] SubTask 7.2: 与用户确认调试目标优先级（若无候选则跳过本阶段）
  - 结论：本次自检发现的 14 个问题均通过静态分析明确定位，无需运行时调试，跳过本阶段

- [x] Task 8: 对每个调试目标执行证据驱动流程
  - 跳过（无候选目标）

## 阶段四：汇总与整改清单

- [x] Task 9: 汇总三类自检结果
  - [x] SubTask 9.1: 合并代码质量、安全、调试三类发现，去重合并
  - [x] SubTask 9.2: 按"高危安全 > 关键正确性 > 运行时稳定性 > 代码质量"排序
  - [x] SubTask 9.3: 为每项高/中危问题在 tasks.md 追加修复任务

- [x] Task 10: 生成最终自检报告
  - [x] SubTask 10.1: 输出统一整改清单（位置/根因/建议/影响范围/优先级）
  - [x] SubTask 10.2: 标注需用户决策的修复方案选择项

## 阶段五：修复任务（基于自检发现，待用户确认后执行）

- [x] Fix-1 (critical): 修复 db/import.ts 中 require('pg-copy-streams') ESM 不兼容问题
  - 已修复：改用动态 `await import('pg-copy-streams') as any`，添加 `@ts-expect-error`
- [x] Fix-2 (critical): 修复 db/import.ts 中 importViaCopy 提前释放 client 问题
  - 已修复：将 `client.release()` 移入 Promise 链 `.finally()` 回调，确保流完成后释放
- [x] Fix-3 (critical): 修复 outboxPublisher.ts 使用 pg.Pool 监听 NOTIFY 事件失效问题
  - 已修复：改用 `pg.Client` 建立持久连接，显式 `await connect()`，移除 `as any` 类型断言
- [x] Fix-4 (major): 修复 goalOptimizer.ts 约束过滤全部路径时 NaN 崩溃
  - 已修复：添加 `filteredMetrics.length === 0` 空数组保护，返回安全默认值
- [x] Fix-5 (major): 修复 backtestQueue.ts Redis URL 解析不支持密码/TLS
  - 已修复：直接传 `connectionString` 给 BullMQ（ioredis 原生支持 URL 格式）
- [x] Fix-6 (major): 修复 auditLog.ts verifyPayload 中 timingSafeEqual 未捕获 RangeError
  - 已修复：添加 `sigBuf.length !== expBuf.length` 长度预检
- [x] Fix-6b (minor): 修复 auditLog.ts NOTIFY 语句字符串拼接
  - 已修复：改为不带 payload 的 `NOTIFY outbox_channel`
- [x] Fix-7 (major): 修复 portfolio.ts calcMWRR 忽略中间现金流
  - 已修复：在回测循环中收集 `mwrrCashflows`（周期性+一次性现金流），传入 calcMWRR
- [x] Fix-8 (major): 修复 monteCarlo.ts withReplacement 参数被忽略
  - 已修复：实现无放回采样分支（usedStarts Set 追踪已使用起始位置）
- [x] Fix-8b (minor): 修复 monteCarlo.ts 中位数计算未对偶数长度取平均
  - 已修复：偶数长度取中间两值平均

# Task Dependencies
- Task 3 依赖 Task 2
- Task 5 依赖 Task 4
- Task 6 依赖 Task 5
- Task 7 依赖 Task 3 与 Task 6（从其结果中筛选调试目标）
- Task 8 依赖 Task 7
- Task 9 依赖 Task 3、Task 6、Task 8
- Task 10 依赖 Task 9
- 阶段一（Task 1-3）与阶段二（Task 4-6）可并行启动
- Fix-1 ~ Fix-8 依赖 Task 10（自检报告完成）并需用户确认
