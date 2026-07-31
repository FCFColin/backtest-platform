# 性能剖析（Profiling）指南（T-29，维度2/7）

> 延迟劣化时需定位"时间花在哪"：函数级 CPU/内存/事件循环证据，避免凭直觉优化。

## Node.js（API 服务）

clinic.js 一站式（火焰图/事件循环/CPU/内存）: `pnpm profile:flame`（CPU 热点）、`pnpm profile:doctor`（事件循环延迟/GC 诊断）。运行中施压（`scripts/load/`），Ctrl-C 生成 HTML 报告。亦可 `node --prof`/`--cpu-prof` 或 `0x`。

## Go（engine-go / data-fetcher）

内置 `net/http/pprof`。Security（T-29）: pprof 暴露堆/goroutine/CPU 高敏数据且 profile 端点可被 DoS 滥用，因此：

- **默认关闭**：仅 `ENABLE_PPROF=true` 启动；默认仅绑定回环（engine-go :6061 / data-fetcher :6060，可 `PPROF_ADDR` 覆盖），**禁止**绑 0.0.0.0
- **远程采集**：经 `kubectl port-forward` 或带鉴权反向代理

```bash
ENABLE_PPROF=true ./engine-go &
go tool pprof http://127.0.0.1:6061/debug/pprof/profile?seconds=30
go tool pprof http://127.0.0.1:6061/debug/pprof/heap
curl http://127.0.0.1:6061/debug/pprof/goroutine?debug=2
```

## 何时剖析

P95/P99 超 SLO；负载测试延迟非线性拐点；内存持续增长（对比两份 heap profile）。
