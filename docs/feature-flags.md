# 特性开关文档（Feature Flags）

> **关联 ADR**: P1-06 Unleash 特性开关  
> **服务地址**: 本地 `http://127.0.0.1:4242` / 生产 `http://unleash:4242`  
> **管理 UI**: 本地 `http://127.0.0.1:4242`（admin/unleash4all）

---

## 已定义 Flag 清单

### 计划限制相关

| Flag 名称               | 默认值  | 影响范围     | 说明                                                     |
| ----------------------- | ------- | ------------ | -------------------------------------------------------- |
| `plan.enterprise-quota` | `false` | 企业级配额   | 启用企业级增强配额（更高 asyncConcurrency / maxTickers） |
| `plan.pro-analytics`    | `false` | Pro 计划分析 | 启用 Pro 计划高级分析功能                                |

### UI 功能开关

| Flag 名称          | 默认值  | 影响范围   | 说明                           |
| ------------------ | ------- | ---------- | ------------------------------ |
| `ui.new-dashboard` | `false` | 前端仪表板 | 启用新版仪表板布局（灰度放量） |

---

## Flag 命名约定

| 前缀    | 用途                   | 示例                    |
| ------- | ---------------------- | ----------------------- |
| `plan.` | 计划/配额限制          | `plan.enterprise-quota` |
| `ui.`   | 前端 UI 功能           | `ui.new-dashboard`      |
| `ops.`  | 运维操作（不在白名单） | `ops.maintenance-mode`  |

---

## 客户端配置

### 后端 SDK

- **轮询间隔**: 15 秒（`refreshInterval: 15`）
- **Bootstrap**: 从 Redis 加载上次已知 flag 状态（`bootstrapOverride: true`）
- **降级策略**: Unleash 不可用时使用 Redis 缓存的 flag 快照；缓存也不可用时 fail-closed（所有 flag 返回 `false`）

### 前端

前端通过 `GET /api/v1/feature-flags` 查询白名单内 flag 状态，不直接连接 Unleash。

---

## 操作手册

### 创建新 Flag

1. 在 Unleash 管理 UI 中创建 flag（名称遵循命名约定）
2. 设置默认策略（`default` 环境为 `false`）
3. 如需前端可见，添加到 `featureFlagRoutes.ts` 的 `VISIBLE_FLAGS` 白名单
4. 更新本文档的 Flag 清单

### 紧急降级

1. 在 Unleash 管理 UI 中将 flag 切换为 `false`
2. SDK 在 15 秒内同步新状态
3. Unleash 不可用时，Redis 缓存保持上次已知状态

### Redis 快照

- **Key**: `unleash:flags:snapshot`
- **更新频率**: 每 5 分钟
- **格式**: JSON（Unleash features API 响应）
- **用途**: Unleash 宕机时 SDK bootstrap 数据源

---

## K8s 生产部署

详见 `k8s/unleash-deployment.yaml`：

- 2 副本 + PDB（minAvailable: 1）
- 资源限制: 256Mi-512Mi / 100m-500m
- 健康检查: `/health` 端点
- Secret 注入: `unleash-secret`（数据库 URL + API Token）
