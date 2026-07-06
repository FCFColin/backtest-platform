# 代码简化机会计划 — 回测平台 (Backtest Platform)

## 概述

本计划识别了整个代码库中可简化的机会。代码库包含 4 个服务（React 前端、Express API、Go 引擎、Go 数据服务），约 6400 个文件，42 个 ADR。核心架构是 DDD + Event Sourcing，正处于从扁平结构向 pnpm monorepo 迁移的过程中（`api/` ↔ `packages/backend/` 镜像、`src/` ↔ `packages/frontend/` 镜像）。

**简化目标**：降低认知负担，提高可维护性，不改变行为。

---

## 优先级分类

| 优先级        | 标准                             | 数量 |
| ------------- | -------------------------------- | ---- |
| **P0 — 阻塞** | 代码重复/镜像导致维护陷阱        | 2    |
| **P1 — 高**   | 单文件过大（>800行）影响理解     | 11   |
| **P2 — 中**   | 复杂逻辑模式、深嵌套、可重构抽象 | 8    |
| **P3 — 低**   | 命名、注释、小碎片化、构建优化   | 8    |

---

## P0: 代码镜像/重复 — 最关键问题

### Task 1: 解决 api/ ↔ packages/backend/ 镜像重复

**Description:** `api/` 和 `packages/backend/src/` 包含 100+ 个相同文件名（几乎完全镜像）。同一逻辑存在两个副本，任何修改都需要维护两处。这是最大的技术债务。

**Acceptance criteria:**

- [ ] 明确唯一源（保留 `packages/backend/src/` 或 `api/`）
- [ ] 删除或归档另一个副本
- [ ] 验证所有引用（import、路径、测试、构建脚本）指向唯一源
- [ ] 验证 `npm run dev`、`npm run test`、`npm run build` 正常工作

**Verification:** `npm run dev` 启动无报错；`npm run test` 全部通过；无残留的指向旧路径的引用

**Dependencies:** 需要用户确认保留哪个版本（`packages/backend` 结构更现代化，但 `api/` 文件更多/更新）

**Files likely touched:** package.json, vite.config.ts, tsconfig.json, docker-compose.yml, 所有引用 api/ 的代码

**Estimated scope:** L (影响 100+ 文件，但本质是路径迁移，可使用 codemod)

**Risk:** 高 — 任何路径引用遗漏会导致构建失败。建议自动化批量替换。

---

### Task 2: 解决 src/ ↔ packages/frontend/ 镜像重复

**Description:** `src/` 和 `packages/frontend/src/` 包含 100+ 个相同文件名。`src/` 包含更厚的单体页面（MonteCarloPage 1644 行），而 `packages/frontend/` 已将页面拆分为特性目录（Params/Results/Presets/Hook 分离）。

**Acceptance criteria:**

- [ ] 明确唯一源（建议保留 `packages/frontend/src/`，结构更现代化）
- [ ] 删除或归档另一个副本
- [ ] 验证 Vite 入口、React Router 配置、Zustand store 等引用正确
- [ ] 验证 E2E 测试仍指向正确路径

**Verification:** `npm run dev` 前端正常加载；Playwright E2E 测试通过

**Dependencies:** 需要用户确认

**Files likely touched:** vite.config.ts, index.html, tsconfig.json, 所有 src/ 路径引用

**Estimated scope:** L

**Risk:** 高 — 与 Task 1 类似

---

## P1: 超大文件拆分

### Task 3: 拆分 MonteCarloPage.tsx (1644 行)

**Description:** `src/pages/MonteCarloPage.tsx` 是最大的单文件。`packages/frontend/src/pages/` 版本已有部分拆分，应将拆分模式应用于所有版本。

**Acceptance criteria:**

- [ ] 提取 Params 子组件（参数面板）
- [ ] 提取 Results 子组件（结果展示）
- [ ] 提取 Presets 子组件（预设列表）
- [ ] 提取 useMonteCarloState 状态逻辑（如果尚未提取）
- [ ] 主文件缩减至 <400 行

**Verification:** 页面功能不变；所有子组件可通过独立 import 使用

**Files likely touched:** `src/pages/MonteCarloPage.tsx`, 新建 3-4 个组件文件

**Estimated scope:** M

---

### Task 4: 拆分 EfficientFrontierPage.tsx (1282 行)

**Description:** 同样是一个大单体页面。

**Acceptance criteria:** 与 Task 3 相同模式

**Files likely touched:** `src/pages/EfficientFrontierPage.tsx`, 新建组件文件

**Estimated scope:** M

---

### Task 5: 拆分 TacticalPage.tsx (1159 行)

**Description:** 同样是一个大单体页面。

**Acceptance criteria:** 与 Task 3 相同模式

**Estimated scope:** M

---

### Task 6: 拆分 OptimizerPage.tsx (1041 行)

**Acceptance criteria:** 与 Task 3 相同模式

**Estimated scope:** M

---

### Task 7: 拆分 CalculatorsPage.tsx (940 行)

**Acceptance criteria:** 与 Task 3 相同模式

**Estimated scope:** M

---

### Task 8: 拆分 RebalancingSensitivityPage.tsx (927 行)

**Acceptance criteria:** 与 Task 3 相同模式

**Estimated scope:** M

---

### Task 9: 拆分 BacktestOptimizerPage.tsx (904 行)

**Acceptance criteria:** 与 Task 3 相同模式

**Estimated scope:** M

---

### Task 10: 拆分 AnalysisCharts.tsx (882 行)

**Description:** `src/components/AnalysisCharts.tsx` 包含多个图表逻辑。建议拆分为独立图表组件或按分析维度分组。

**Acceptance criteria:**

- [ ] 提取独立子图表组件
- [ ] 主组件仅做组合和 props 传递

**Estimated scope:** M

---

### Task 11: 拆分 PortfolioEditor.tsx (830 行)

**Description:** 复杂的表单组件，建议拆分 form schema / validators / input components。

**Acceptance criteria:**

- [ ] 表单验证逻辑提取
- [ ] 输入组件提取
- [ ] 主组件 <300 行

**Estimated scope:** M

---

## P2: 复杂逻辑与结构简化

### Task 12: 简化 app.ts 中间件挂载 (772 行)

**Description:** `api/app.ts` 是主 Express 应用，包含 20+ 路由挂载、5 层速率限制、大量中间件。建议提取路由组注册和中间件栈为独立配置模块。

**Acceptance criteria:**

- [ ] 提取路由注册为独立模块 `routes/index.ts`
- [ ] 提取中间件栈为 `middleware/stack.ts`
- [ ] 主文件 <300 行

**Estimated scope:** M

---

### Task 13: 简化 refreshToken.ts (569 行)

**Description:** JWT refresh token 逻辑集中在一个文件中。建议拆分为：token verification、blacklist、session management 三个子模块。

**Acceptance criteria:** 各子模块职责单一，可独立测试

**Estimated scope:** M

---

### Task 14: 简化 config/index.ts (442 行)

**Description:** 配置加载和验证集中在一个文件中。建议按配置域拆分（数据库、Redis、引擎、速率限制、日志）。

**Acceptance criteria:**

- [ ] 按配置域提取子模块
- [ ] 保留总入口用于聚合

**Estimated scope:** M

---

### Task 15: 简化 engine-go/internal/optimizer/optimizer.go (947 行)

**Description:** 组合优化引擎，建议按求解器类型拆分（有效前沿、最小方差、最大夏普等）。

**Acceptance criteria:** 各求解器独立文件，共享公共 types

**Estimated scope:** L

---

### Task 16: 简化 engine-go/internal/montecarlo/montecarlo.go (790 行)

**Description:** Monte Carlo 仿真引擎，建议拆分仿真核心、结果统计、报告生成。

**Estimated scope:** L

---

### Task 17: 简化 engine-go/internal/engine/statistics.go (636 行)

**Description:** 统计函数集合，建议按统计类别分组（风险指标、收益指标、相关性分析）。

**Estimated scope:** L

---

### Task 18: 简化 api/engine/backtestRunner.ts (588 行)

**Description:** 回测运行器，建议拆分输入验证、数据处理、引擎调用、结果格式化。

**Estimated scope:** M

---

### Task 19: 简化 api/routes/authRoutes.ts (508 行)

**Description:** 认证路由，建议拆分为 login/logout/register/refresh 独立 handler 文件。

**Estimated scope:** M

---

## P3: 命名与碎片化简化

### Task 20: 消除冗余的布尔参数

**Description:** 全局搜索 `function(... boolean)` 模式，找到用多个布尔参数控制行为的函数，替换为 options 对象。

**Acceptance criteria:** 所有修改后的函数保持相同行为

**Verification:** 单元测试全部通过

**Estimated scope:** S (全局搜索，每个修改点很小)

---

### Task 21: 消除嵌套三元表达式

**Description:** 全局搜索 `? : ? :` 模式（连续三元），替换为 if/else 链或查找对象。

**Acceptance criteria:** 替换后的代码语义相同

**Verification:** 单元测试全部通过

**Estimated scope:** S

---

### Task 22: 消除不必要的 async/await wrapper

**Description:** 全局搜索 `async function(){ return await ... }` 模式，移除不必要的 async 标记。

**Acceptance criteria:** 调用方无需修改（Promise 行为不变）

**Verification:** 单元测试全部通过

**Estimated scope:** S

---

### Task 23: 消除冗余的布尔返回

**Description:** 全局搜索 `if(...){ return true; } return false;` 模式，替换为直接返回条件表达式。

**Estimated scope:** S

---

### Task 24: 统一错误响应格式

**Description:** 检查所有路由 handler 中的错误返回格式，确保全部使用 RFC 7807 格式（`{ success: false, error: { type, title, status, code, detail } }`）。查找遗留的 `{ code, message }` 格式。

**Acceptance criteria:** 所有 API 错误响应格式一致

**Estimated scope:** M

---

### Task 25: 合并重复的工具函数

**Description:** 检查 `api/utils/` 和 `packages/backend/src/utils/` 中的工具函数是否重复，保留一份并统一引用。

**Estimated scope:** M

---

### Task 26: 清理测试覆盖率排除规则

**Description:** 检查 `vitest.config.ts` 和 `scripts/check-coverage.mjs` 中的排除规则，确认是否仍有必要。部分排除可能是历史遗留。

**Acceptance criteria:** 没有不必要的排除规则

**Estimated scope:** S

---

### Task 27: 简化 Docker 构建

**Description:** 当前有 6 个 Dockerfile（Dockerfile, Dockerfile.backend, Dockerfile.frontend, Dockerfile.distroless, engine-go/Dockerfile, data-fetcher/Dockerfile）。检查是否有多余的构建目标，是否可以合并。

**Estimated scope:** S

---

## 执行计划

### 阶段 1: P0 — 消除镜像（最高优先级）

必须先解决镜像问题，否则后续的简化工作会在两个副本上重复。

```
Task 1 ────────────────────→ Task 2（可并行，需用户确认保留哪个副本）
```

**Checkpoint 1:**

- [ ] 镜像解决后 `npm run dev` 正常
- [ ] `npm run test` 全部通过
- [ ] 代码行数对比（确认减少）

---

### 阶段 2: P1 — 超大文件拆分

P0 解决后，确定唯一副本，拆分超大文件。

```
Task 3-11（可并行，每个文件独立）
```

**Checkpoint 2:**

- [ ] 所有超大文件已拆分
- [ ] 页面功能不变
- [ ] 测试通过

---

### 阶段 3: P2 — 复杂逻辑简化

```
Task 12-19（可并行，每个文件独立）
```

**Checkpoint 3:**

- [ ] 所有复杂文件已重构
- [ ] 测试通过

---

### 阶段 4: P3 — 全局碎片化清理

```
Task 20-27（可并行，模式搜索可批量处理）
```

**Final Checkpoint:**

- [ ] 所有测试通过
- [ ] 构建无警告
- [ ] Linter 通过
- [ ] 代码行数对比：总体减少
- [ ] 可读性评估

---

## 风险与缓解

| 风险                         | 影响          | 缓解                                  |
| ---------------------------- | ------------- | ------------------------------------- |
| 镜像合并引入路径引用遗漏     | 高 — 构建失败 | 自动化路径搜索 + codemod 批量替换     |
| 文件拆分改变组件行为         | 高 — 回归     | 每个拆分单独验证 E2E                  |
| 引擎 Go 文件修改引入计算偏差 | 高 — 结果错误 | property-based 测试对比 TS 和 Go 引擎 |
| 简化后代码不符合项目约定     | 中            | 每个简化遵循 AGENTS.md 中的约定       |
| 简化范围扩散到未计划文件     | 中            | 严格遵循"只改目标文件"原则            |

## 依赖关系图

```
P0: Task 1 ───┐
              ├──→ P1: Task 3-11
P0: Task 2 ───┘       ├──→ P2: Task 12-19
                                  ├──→ P3: Task 20-27
```

**关键依赖:** P0 必须在 P1 之前完成（否则 P1 拆分工作会在两个副本上重复）。P1 和 P2 可部分并行（前端拆分 vs 后端简化）。P3 全局清理可在任何阶段后执行。

---

## 开放问题

1. **镜像保留策略:** 保留 `packages/backend/src/` + `packages/frontend/src/`（更现代化的结构），还是保留 `api/` + `src/`（更久远的历史但可能更新）？建议保留 `packages/` 版本。
2. **Go 引擎简化范围:** Task 15-17 涉及 Go 代码。是否需要 Go 开发经验？
3. **简化粒度:** 每个超大文件的拆分粒度是否接受？还是倾向于更细粒度的组件？
4. **并行策略:** 是否同时推进 P0 + 开始 P1（在未受镜像影响的 Go 引擎上）？
