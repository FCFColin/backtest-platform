# 技术调研摘要（P4 系列）

> 4 份 P4 系列调研报告的结论汇总。原始报告已删除。

## P4-2: 前端状态管理架构

- 决策：维持 Zustand，不重写 useBacktestWs，TanStack Query 选择性引入
- 触发条件：useBacktestWs 复杂度超阈值时考虑 XState 重写

## P4-3: TimescaleDB 连续聚合（CAGG）

- 决策：下季度评估，当前不推进
- 触发条件：日度聚合查询延迟 > 500ms 或数据量 > 1000 万行

## P4-4: 多区域部署

- 决策：GA 后按用户分布评估，当前单区域足够
- 触发条件：海外用户占比 > 30% 或单区域延迟 > 200ms

## P4-5: WebSocket 服务独立化

- 决策：当前架构可维持，10K 并发时再评估
- 触发条件：WebSocket 并发 > 10K 或 Express 重启恢复 > 5s
- 低成本改进：Socket.io + Redis Adapter（多实例时引入）
