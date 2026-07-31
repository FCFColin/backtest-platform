# 特性开关文档（Feature Flags）

> **ADR**: P1-06 Unleash；本地 `http://127.0.0.1:4242` / 生产 `http://unleash:4242`（admin/unleash4all）

## 已定义 Flag

| Flag                    | 默认    | 影响范围     | 说明                               |
| ----------------------- | ------- | ------------ | ---------------------------------- |
| `plan.enterprise-quota` | `false` | 企业级配额   | 更高 asyncConcurrency / maxTickers |
| `plan.pro-analytics`    | `false` | Pro 计划分析 | 高级分析功能                       |
| `ui.new-dashboard`      | `false` | 前端仪表板   | 新版布局（灰度放量）               |

## 命名约定

`plan.` 计划/配额、`ui.` 前端 UI、`ops.` 运维操作（不在白名单）。

## 客户端配置

- **后端 SDK**: 轮询 15s；Bootstrap 从 Redis 加载上次状态；Unleash 与 Redis 均不可用 → fail-closed（flag 全 false）
- **前端**: 经 `GET /api/v1/feature-flags` 查询白名单 flag，不直连 Unleash

## 操作手册

### 创建新 Flag

1. Unleash UI 创建（名称遵循命名约定）→ 默认策略 `false`
2. 前端可见则加入 `featureFlagRoutes.ts` 的 `VISIBLE_FLAGS` 白名单
3. 更新本文档 Flag 清单

### 紧急降级

1. Unleash UI 将 flag 切为 `false`；SDK 15s 内同步
2. Unleash 不可用时 Redis 缓存保持上次已知状态

### Redis 快照

`unleash:flags:snapshot`（每 5 分钟更新, JSON = Unleash features API 响应）——Unleash 宕机时 SDK bootstrap 数据源。

## K8s 生产部署

详见 `k8s/unleash-deployment.yaml`：2 副本 + PDB(minAvailable: 1)；资源 256Mi-512Mi / 100m-500m；`/health` 健康检查；Secret 注入 `unleash-secret`（DB URL + API Token）。
