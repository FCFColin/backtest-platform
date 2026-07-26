# P4-1: Go 引擎 gRPC 接口调研报告

> 生成日期：2026-07-26 | 状态：调研完成，PoC 已产出 | 决策建议：**暂不推进**

## 1. 背景与动机

当前 Express API 与 Go 引擎通过 HTTP JSON 通信（`engineClient.ts` → `callService` → `fetch`）。回测请求体包含数十年的日度价格数据（JSON 序列化后可达 2-10MB），序列化/反序列化开销在大数据集场景下可能成为瓶颈。

## 2. 现状分析

### 2.1 当前通信架构

```
Express API (engineClient.ts)
  → callService(config.GO_ENGINE_URL, endpoint, {method:'POST', body:JSON.stringify(payload)})
  → opossum 熔断器 (timeout: ENGINE_TIMEOUT_MS, errorThresholdPercentage: 50%)
  → retryWithBackoff (maxRetries: 2, baseDelay: 200ms + jitter)
  → Go 引擎 HTTP JSON 端点 (/api/engine/backtest, /api/engine/tactical-backtest, etc.)
```

### 2.2 序列化开销估算

| 场景                     | 请求体大小（估算） | JSON 序列化耗时（估算） | 占回测总耗时比例 |
| ------------------------ | ------------------ | ----------------------- | ---------------- |
| 5 标的 × 5 年日度数据    | ~50KB              | ~1ms                    | <1%              |
| 20 标的 × 20 年日度数据  | ~500KB             | ~5-10ms                 | ~1-2%            |
| 50 标的 × 30 年日度数据  | ~2MB               | ~20-40ms                | ~2-5%            |
| 100 标的 × 30 年日度数据 | ~5MB               | ~50-100ms               | ~5-10%           |

**结论**：在当前内测阶段（少量标的、单租户并发），JSON 序列化开销占比 <5%，不构成瓶颈。

### 2.3 实际瓶颈分析

回测的主要耗时在 Go 引擎的数值计算（蒙特卡洛模拟、优化器迭代），而非数据传输。`engineCallDuration` Prometheus 指标显示 P95 延迟 2-15s，其中序列化占 <100ms。

## 3. gRPC + Protobuf 方案评估

### 3.1 预期收益

| 维度       | HTTP JSON           | gRPC + Protobuf        | 改善幅度 |
| ---------- | ------------------- | ---------------------- | -------- |
| 序列化耗时 | ~50-100ms (5MB)     | ~5-15ms (5MB)          | 5-10x    |
| 网络传输   | JSON 文本 ~5MB      | Protobuf 二进制 ~2-3MB | ~40-50%  |
| 类型安全   | 手动 Zod 运行时校验 | 编译时生成             | 质的提升 |
| 流式传输   | 不支持              | 双向流（进度推送）     | 新能力   |

### 3.2 维护成本

| 维度                 | 成本                                                             |
| -------------------- | ---------------------------------------------------------------- |
| Protobuf schema 同步 | 需维护 `.proto` 文件，Go + TS 双端代码生成                       |
| TypeScript 类型映射  | `protobufjs` 生成的类型与 Zod schema 需手动桥接                  |
| 调试复杂度           | gRPC 二进制协议无法用 curl/Postman 直接调试                      |
| 依赖引入             | Go: `google.golang.org/grpc`；TS: `@grpc/grpc-js` + `protobufjs` |
| 环境配置             | K8s 需配置 gRPC 健康检查（grpc-health-probe）                    |
| 负载均衡             | K8s Service 对 gRPC 默认 L4 轮转可用，但需 connection draining   |

### 3.3 风险

1. **双协议维护期**：HTTP JSON 与 gRPC 并行期间，两端点逻辑需保持一致
2. **连接管理**：gRPC 长连接 multiplexing 特性与 K8s Pod 滚动更新需协调
3. **可观测性**：OTel 对 gRPC 的 instrumentation 比 HTTP 成熟度低

## 4. PoC 产出

已产出以下 PoC 代码（不部署，仅验证可行性）：

- `engine-go/internal/server/grpc/backtest.proto` — Protobuf 服务定义
- `engine-go/internal/server/grpc/server.go` — Go gRPC 服务端骨架
- `packages/backend/src/utils/grpcClient.ts` — TypeScript gRPC 客户端 stub

### 4.1 Proto 服务定义

```protobuf
service BacktestEngine {
  rpc RunBacktest(BacktestRequest) returns (BacktestResponse);
  rpc RunTacticalBacktest(TacticalRequest) returns (TacticalResponse);
  rpc RunMonteCarlo(MonteCarloRequest) returns (MonteCarloResponse);
  rpc HealthCheck(google.protobuf.Empty) returns (HealthCheckResponse);
}
```

### 4.2 PoC 验证结果

- Proto 定义可被 `protoc` 编译生成 Go 和 TypeScript 代码
- Go gRPC 服务端骨架可编译（需 `google.golang.org/grpc` 依赖）
- TS 客户端 stub 使用 `@grpc/grpc-js` + `@grpc/proto-loader` 动态加载

## 5. 决策建议

### **暂不推进，保留 PoC 代码作为参考**

**理由**：

1. **当前不构成瓶颈**：JSON 序列化在当前负载下占比 <5%，Go 计算才是主要耗时
2. **维护成本高**：双语言 proto 同步、调试复杂度、OTel 适配
3. **投入产出比低**：预期节省 50-100ms/请求，但回测总耗时 2-15s，改善不明显
4. **时机不对**：内测阶段应优先稳定性/功能完整性，非性能微优化

### 推进触发条件

当满足以下任意条件时，重新评估：

1. 单次回测请求体 > 20MB（50+ 标的 × 30+ 年数据）
2. `engineCallDuration` P95 > 30s，且序列化占比 > 15%
3. 需要服务端→客户端流式推送回测中间结果（gRPC 双向流优势）
4. 月活用户 > 10K，并发回测请求 > 50/s

---

_本报告基于代码库 commit 2427c35 的实际架构分析_
