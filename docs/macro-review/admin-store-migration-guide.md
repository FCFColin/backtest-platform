# 管理后台 Store 迁移指南

## 背景

4 个管理后台页面（`packages/frontend/src/pages/admin/`）直接使用 `apiFetch` 调用后端 API，
导致 API 调用逻辑散落在各组件中，与当前状态管理模式不一致。

已在 `packages/frontend/src/store/adminStore.ts` 创建 `useAdminStore`，
统一封装所有管理后台 API 调用。

## 迁移步骤

### 1. AdminDashboard.tsx

**当前**：`fetchDashboardData` 中直接调用 `apiFetch('/api/admin/stats')`，
数据转换逻辑（`buildDashboardData` 等）内联。

**迁移后**：

```typescript
import { useAdminStore } from '../../store/adminStore';

export default function AdminDashboard() {
  const dashboard = useAdminStore((s) => s.dashboard);
  const loading = useAdminStore((s) => s.loading);
  const fetchDashboard = useAdminStore((s) => s.fetchDashboard);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  // 使用 dashboard 渲染（结构与当前一致）
}
```

**移除**：

- `buildDashboardData`、`buildServiceHealth`、`buildDataStats`、`buildSystemInfo` 等函数
- `KpiCard`、`ServiceStatusItem` 等纯展示组件可保留

### 2. DataManagement.tsx

**当前**：直接调用 `apiFetch('/api/data/manage/stats')` 和 `fetch('/api/data/health')`，
通过 `doAction` 手动管理 action 按钮。

**迁移后**：

```typescript
import { useAdminStore } from '../../store/adminStore';

export default function DataManagement() {
  const dataStats = useAdminStore((s) => s.dataStats);
  const loading = useAdminStore((s) => s.loading);
  const fetchDataStats = useAdminStore((s) => s.fetchDataStats);
  const triggerIncrementalUpdate = useAdminStore((s) => s.triggerIncrementalUpdate);
  const triggerFullUpdate = useAdminStore((s) => s.triggerFullUpdate);

  useEffect(() => {
    fetchDataStats();
  }, []);

  // Action 按钮改用 store 方法
  // <button onClick={triggerIncrementalUpdate}>增量更新</button>
}
```

**注意**：当前代码还手动调用 `fetch('/api/data/health')` 检查 Go 服务状态，
可用 `fetchGoDataHealth` 替代。

### 3. SystemMonitor.tsx

**当前**：`fetchServices` 和 `fetchMonitorData` 分别调用 `/api/admin/stats` 和 `/api/admin/system`。

**迁移后**：

```typescript
import { useAdminStore } from '../../store/adminStore';

export default function SystemMonitor() {
  const systemInfo = useAdminStore((s) => s.systemInfo);
  const dashboard = useAdminStore((s) => s.dashboard);
  const fetchSystemInfo = useAdminStore((s) => s.fetchSystemInfo);
  const fetchDashboard = useAdminStore((s) => s.fetchDashboard);

  useEffect(() => {
    fetchSystemInfo();
    fetchDashboard();
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchSystemInfo();
        fetchDashboard();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);
}
```

### 4. SystemSettings.tsx

**当前**：调用 `apiFetch('/api/admin/stats')` 获取服务状态，
`handleClearCache` 调用 `apiFetch('/api/data/manage/update/refetch')`。

**迁移后**：

```typescript
import { useAdminStore } from '../../store/adminStore';

export default function SystemSettings() {
  const dashboard = useAdminStore((s) => s.dashboard);
  const fetchDashboard = useAdminStore((s) => s.fetchDashboard);
  const triggerRefetch = useAdminStore((s) => s.triggerRefetch);

  useEffect(() => {
    fetchDashboard();
  }, []);

  // handleClearCache -> triggerRefetch
}
```

### 5. AnalysisPage.tsx

`AnalysisPage.tsx` 是用户页面（非管理后台），其直接调用 `apiFetch` 是页面级的数据获取，
不适合抽象到 store。当前使用 `useAsyncAction` hook 的模式是合理的，无需修改。

## 验证

迁移后每个页面：

1. 功能不变（数据正确加载和显示）
2. `npm run check` 类型检查通过
3. 浏览器控制台无 API 调用错误

## 时间估计

| 页面               | 估计工时 |
| ------------------ | -------- |
| AdminDashboard.tsx | 15 min   |
| DataManagement.tsx | 20 min   |
| SystemMonitor.tsx  | 15 min   |
| SystemSettings.tsx | 10 min   |
| 合计               | ~1 小时  |
