# ADR-030: Distroless 镜像评估

| 字段 | 值            |
| ---- | ------------- |
| 状态 | 已接受（PoC） |
| 日期 | 2026-06-25    |

## Context

当前 Node API 使用 `node:20-alpine` + `USER node`（CIS 合规）。distroless 进一步缩小攻击面。

## PoC（`Dockerfile.distroless`）

| 指标     | alpine runner    | distroless（预估）           |
| -------- | ---------------- | ---------------------------- |
| 攻击面   | shell + apk      | 无 shell                     |
| 镜像体积 | ~150MB           | ~120MB（esbuild 单文件有利） |
| 调试     | wget/healthcheck | 需 K8s exec 侧车             |

## Decision

**短期**：保持 alpine + digest pin + non-root（已满足多数企业基线）。  
**中期**：Node API（esbuild 单文件）可迁移 `gcr.io/distroless/nodejs20-debian12`；Go 服务优先 distroless/static。

## Consequences

- HEALTHCHECK 需改为 K8s probe 或 grpc health
- 权衡安全 vs 运维便利性
