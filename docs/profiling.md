# 性能剖析（Profiling）指南（T-29，维度2/7）

> 企业为何需要：延迟劣化时需定位"时间花在哪"。剖析（profiling）提供函数级 CPU/内存/事件循环
> 证据，避免凭直觉优化。Node 与 Go 各有标准工具。

## Node.js（API 服务）

使用 [clinic.js](https://clinicjs.org/)（事件循环/CPU/内存一站式）：

```bash
# 火焰图（CPU 热点）
npm run profile:flame
# Doctor（事件循环延迟、GC、I/O 诊断 + 建议）
npm run profile:doctor
```

运行后对服务施加负载（见 `scripts/load/`），Ctrl-C 结束，clinic 生成 HTML 报告。
亦可用内置 `node --prof` / `--cpu-prof`，或 `0x` 生成火焰图。

## Go（engine-go / data-fetcher）

内置 `net/http/pprof`。

Security（T-29）：pprof 端点暴露堆/goroutine/CPU 等高敏数据，且 `/debug/pprof/profile`
会触发持续 CPU 采样（可被滥用为 DoS）。因此：

- **默认关闭**：仅当 `ENABLE_PPROF=true` 时启动 pprof 服务。
- **默认仅绑定回环**：地址默认 `127.0.0.1:6061`（engine-go）/ `127.0.0.1:6060`（data-fetcher），
  可经 `PPROF_ADDR` 覆盖。**禁止**直接绑定 `0.0.0.0` 暴露公网。
- **远程采集**：经 `kubectl port-forward` 或前置带鉴权的反向代理，而非裸暴露端口。

```bash
# 在目标服务所在主机本地采集 30s CPU profile
ENABLE_PPROF=true ./engine-go &
go tool pprof http://127.0.0.1:6061/debug/pprof/profile?seconds=30

# 堆与 goroutine
go tool pprof http://127.0.0.1:6061/debug/pprof/heap
curl http://127.0.0.1:6061/debug/pprof/goroutine?debug=2
```

## 何时剖析

- P95/P99 超出 SLO（见 `docs/runbook.md`）。
- 负载测试（`scripts/load/`）出现延迟非线性增长拐点。
- 内存持续增长（疑似泄漏）→ 对比两份 heap profile 的差异。
