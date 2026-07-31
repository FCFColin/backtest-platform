# 混沌实验

## 实验清单

| 实验              | 注入故障               | 验证目标                                     |
| ----------------- | ---------------------- | -------------------------------------------- |
| network-partition | API to PG 网络分区 30s | 熔断器触发, 降级到 Go 数据服务               |
| redis-down        | Redis 停止 60s         | 认证 fail-closed 503, 限流 fail-closed       |
| engine-down       | Go 引擎停止            | 计算 API 返回 503 + Retry-After(fail-closed) |
| pg-restart        | PostgreSQL 重启        | 连接池恢复, 数据完整性                       |
| container-restart | API 容器重启           | graceful shutdown, 请求不丢失                |

## 运行方式

    docker compose -f docker-compose.chaos.yml up -d
    pnpm test:chaos

## 前置条件: Docker + 完整应用栈(chaos compose)。

## 验证点: 熔断器状态, 降级标记(degraded: true), fail-closed 503, 审计日志连续性, 恢复后一致性。
