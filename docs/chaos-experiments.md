# 混沌实验

## 实验清单

| 实验              | 注入故障            | 验证目标                      |
| ----------------- | ------------------- | ----------------------------- |
| network-partition | API→PG 网络分区 30s | 熔断触发, 降级 Go 数据服务    |
| redis-down        | Redis 停止 60s      | 认证/限流 fail-closed 503     |
| engine-down       | Go 引擎停止         | 计算 API 503 + Retry-After    |
| pg-restart        | PostgreSQL 重启     | 连接池恢复, 数据完整性        |
| container-restart | API 容器重启        | graceful shutdown, 请求不丢失 |

## 运行

    docker compose -f docker-compose.chaos.yml up -d
    pnpm test:chaos

前置: Docker + 完整应用栈。验证点: 熔断器状态、degraded: true、fail-closed 503、审计日志连续性、恢复后一致性。
