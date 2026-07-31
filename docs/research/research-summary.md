# 技术调研摘要（P4 系列）

> 4 份 P4 系列调研报告结论汇总。原始报告已删除。

## P4-2: 前端状态管理

维持 Zustand；TanStack Query 选择性引入。触发条件: useBacktestWs 复杂度超阈值 → 考虑 XState 重写。

## P4-3: TimescaleDB CAGG

下季度评估，当前不推进。触发: 日度聚合查询 > 500ms 或数据量 > 1000 万行。

## P4-4: 多区域部署

GA 后按用户分布评估。触发: 海外用户 > 30% 或单区域延迟 > 200ms。

## P4-5: WebSocket 独立化

当前架构可维持。触发: 并发 > 10K 或 Express 重启恢复 > 5s。低成本改进: Socket.io + Redis Adapter（多实例时）。
