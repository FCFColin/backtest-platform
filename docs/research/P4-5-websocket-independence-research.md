# P4-5: WebSocket 服务独立化评估报告

> 生成日期：2026-07-26 | 状态：调研完成 + 代码审查 | 决策建议：**当前架构可维持，10K 并发时再评估**

## 1. 现状审查

### 1.1 当前 WebSocket 架构

WebSocket 服务内嵌在 Express HTTP 服务器中（`packages/backend/src/services/backtestWs.ts`），通过 `noServer` 模式挂载到 HTTP server 的 `upgrade` 事件。

```
HTTP Server (Express)
  └── upgrade 事件 → wss.handleUpgrade()
        └── handleConnection(ws, jobId, userId)
              ├── ioredis subscriber（每连接独占一个）
              ├── subscriber.on('message') → ws.send()
              ├── ws.on('close') → cleanup()
              └── ws.on('error') → cleanup()
```

### 1.2 连接生命周期管理审查

**优点**：

- ✅ 每个连接独占 ioredis 订阅连接，避免 subscribe 模式下不能发其他命令的问题
- ✅ `cleanup()` 函数有 `cleaned` 防重入标志，避免重复清理
- ✅ `close` 和 `error` 事件都触发 cleanup，覆盖正常和异常关闭
- ✅ `wsConnectionsActive` Prometheus gauge 监控活跃连接数
- ✅ `unsubscribe` + `quit` 释放 Redis 连接，无泄漏

**风险点**：

- ⚠️ 每个 WS 连接创建一个 ioredis 连接（10K 连接 = 10K Redis 连接），Redis 连接数可能成为瓶颈
- ⚠️ `subscriber.quit()` 是异步的，在高并发关闭时可能产生连接堆积
- ⚠️ 无心跳/ping 机制，半开连接（客户端断网但 TCP 未关闭）无法检测
- ⚠️ 无连接超时，空闲连接不会自动清理

### 1.3 内存评估

| 组件               | 内存/连接（估算） | 10K 连接合计 |
| ------------------ | ----------------- | ------------ |
| WebSocket 对象     | ~50KB             | ~500MB       |
| ioredis subscriber | ~100KB            | ~1GB         |
| 事件监听器/闭包    | ~10KB             | ~100MB       |
| **合计**           | ~160KB            | ~1.6GB       |

Express 进程内存限制通常 1-2GB（Node.js heap limit），10K 并发 WS 连接将触及内存上限。

## 2. Socket.io + Redis Adapter 方案评估

### 2.1 方案概述

```
独立 WS 服务（Socket.io Server）
  ← Redis Adapter（pub/sub） → Express API
  ← Redis Adapter → Worker（任务进度推送）
```

### 2.2 对比

| 维度           | 当前（ws + ioredis）        | Socket.io + Redis Adapter           |
| -------------- | --------------------------- | ----------------------------------- |
| 连接数上限     | ~5-8K（内存限制）           | ~20-30K（连接复用）                 |
| Redis 连接     | 每WS连接1个Redis连接        | 单一Adapter连接（复用）             |
| 心跳/keepalive | 无（手动实现）              | 内置 ping/pong + 超时清理           |
| 房间/命名空间  | 手动 jobId 路由             | 内置 room 机制                      |
| 重连/降级      | 前端 useBacktestWs 手动实现 | 内置（自动重连 + 轮询降级）         |
| 包大小         | ws ~3KB                     | socket.io ~50KB（含 client bundle） |
| 协议开销       | 原生 WebSocket（最少）      | Socket.io 协议层（~20% 开销）       |
| 调试工具       | 无                          | Socket.io DevTools                  |

### 2.3 成本

- 包大小增加：socket.io + socket.io-redis-adapter ≈ 60KB
- 前端 client bundle：socket.io-client ≈ 40KB（gzipped）
- 运维复杂度：需独立部署 WS 服务 + 负载均衡配置

## 3. useBacktestWs 轮询降级评估

### 3.1 当前降级机制

```
useBacktestWs
  → WS 连接（优先）
  → 失败 → 指数退避重连（1s → 2s → 4s，上限 30s）
  → 重连耗尽（3次） → 降级到 HTTP 轮询
  → 轮询指数退避（1s → 2s → ... → 30s 上限）
  → 终态（completed/failed）→ 停止
```

### 3.2 Express 重启后的恢复时间

| 阶段               | 耗时   | 说明                        |
| ------------------ | ------ | --------------------------- |
| Express 进程重启   | 2-5s   | K8s Pod 重启 + 健康检查通过 |
| 前端检测到 WS 断开 | 即时   | `ws.onclose` 立即触发       |
| 重连尝试 1         | 1s     | 退避基础延迟                |
| 重连尝试 2         | 2s     | 指数退避                    |
| 重连尝试 3         | 4s     | 指数退避                    |
| 降级到轮询         | 0s     | 重连耗尽后立即              |
| 首次轮询成功       | 1s     | API 可用后                  |
| **总恢复时间**     | ~8-13s | 从断开到恢复进度推送        |

**评估**：8-13s 的恢复时间在内测阶段可接受（用户感知为短暂卡顿）。GA 后需评估是否可接受。

## 4. 决策建议

### **当前架构可维持，10K 并发时再评估**

**理由**：

1. 内测阶段并发 WS 连接 < 100，当前架构完全足够
2. Socket.io 引入 100KB+ 依赖（client + server），收益在 10K+ 并发才显著
3. 当前 WS 连接生命周期管理实现良好（cleanup 防泄漏、Prometheus 监控）
4. 轮询降级恢复时间 8-13s 可接受

### 改进建议（低成本，当前可做）

1. **添加心跳机制**：每 30s 发送 ping，60s 无 pong 则关闭连接

   ```typescript
   // 在 handleConnection 中添加
   const pingInterval = setInterval(() => {
     if (ws.readyState === WebSocket.OPEN) ws.ping();
   }, 30000);
   ws.on('pong', () => {
     /* alive */
   });
   // cleanup 中 clearInterval(pingInterval)
   ```

2. **添加连接超时**：5 分钟无消息则自动关闭

   ```typescript
   const idleTimeout = setTimeout(() => ws.close(1000, 'idle'), 5 * 60 * 1000);
   // 收到消息时 reset idleTimeout
   ```

3. **优化 Redis 连接**：考虑用单一 subscriber 连接 + 消息路由替代每连接独占

### 独立化触发条件

1. 并发 WS 连接 > 5000（内存压力）
2. Express 进程因 WS 连接数导致 HTTP 请求处理延迟
3. 需要跨 Pod 广播（当前已有 Redis Pub/Sub，但每连接独占订阅连接限制扩展性）

---

_本报告基于代码库 commit 2427c35 的 `backtestWs.ts`（196行）代码审查_
