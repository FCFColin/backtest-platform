# 混沌工程实验

> SRE: 混沌工程是验证系统可靠性的主动方法
> 企业为何需要：未经验证的可靠性假设是最大的风险，生产故障是最好的老师
> 权衡：实验可能影响正常服务，但在受控环境下发现问题的成本远低于生产事故

## 实验 1：数据库断开

### 稳态假设

- API 健康检查返回 200
- 错误率 < 1%
- P99 延迟 < 5s

### 实验方法

1. 启动完整服务栈（docker-compose up）
2. 确认稳态（健康检查通过、发送 100 个正常请求）
3. 断开 PostgreSQL 连接：`docker network disconnect backtest_default backtest-postgres-1`
4. 持续发送请求 60s
5. 恢复连接：`docker network connect backtest_default backtest-postgres-1`
6. 验证服务恢复

### 成功标准

- 熔断器在 5 次失败后触发（data-fetcher gobreaker 配置）
- API 返回 503 Service Unavailable（非 500 Internal Server Error）
- 无 5xx 雪崩（错误率不因重试而飙升）
- 恢复连接后 30s 内服务恢复正常

### 当前系统预期

- ✅ 熔断器在 5 次失败后触发（pgCircuitBreaker 配置）
- ✅ API 返回 503 Service Unavailable（熔断器返回 503 而非 500）
- ✅ 无 5xx 雪崩（错误率不因重试而飙升）
- ✅ 恢复连接后 30s 内服务恢复正常

## 实验 2：外部服务延迟（BaoStock 慢 5s）

### 稳态假设

- 数据获取请求 P99 < 3s
- 成功率 > 95%

### 实验方法

1. 使用 toxiproxy 或 tc 注入 5s 延迟到 BaoStock API
2. 发送 100 个数据获取请求
3. 观察超时和降级行为

### 成功标准

- 请求超时后降级到本地文件缓存
- 无事件循环阻塞（Node.js 其他请求正常响应）
- 延迟注入期间 API 健康检查仍返回 200

### 当前系统预期

- ✅ 请求超时后降级到本地文件缓存
- ✅ 无事件循环阻塞（Node.js 其他请求正常响应）
- ✅ 延迟注入期间 API 健康检查仍返回 200
- ✅ 跨平台兼容（Linux tc + Windows/Mac 容器停止模拟）

## 实验 3：高并发重启（100 并发 + SIGTERM）

### 稳态假设

- 服务正常运行
- 100 并发请求成功率 > 99%

### 实验方法

1. 启动 100 并发请求
2. 在请求进行中发送 SIGTERM
3. 验证优雅关闭

### 成功标准

- 优雅关闭期间在途请求完成（非立即断开）
- 零请求丢失（100 个请求全部收到响应）
- 30s 内完成关闭
- 关闭后无僵尸进程

### 当前系统预期

- ✅ 已实现优雅关闭（Node.js SIGTERM handler + Go 服务优雅关闭）
- ✅ 在途请求完成验证（完成率 > 95%）
- ✅ 跨平台 SIGTERM 发送（docker kill --signal=SIGTERM）

## 运行说明

### 前置条件

- Docker 环境已安装并运行
- 完整服务栈已启动：`docker compose up -d`
- 所有服务健康检查通过

### 运行混沌实验

```bash
# 运行所有混沌实验
npm run test:chaos

# 运行单个实验
npx vitest run -c vitest.config.chaos.ts tests/chaos/experiment-1-db-disconnect.test.ts
```

### 注意事项

- 混沌实验会在运行期间中断服务，请勿在生产环境运行
- 实验结束后会自动恢复容器状态
- 无 Docker 环境时实验会自动跳过（SKIP），不会失败
