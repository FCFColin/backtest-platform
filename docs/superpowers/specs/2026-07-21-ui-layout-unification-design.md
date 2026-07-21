# UI 布局统一化设计文档

> **日期**: 2026-07-21
> **主题**: 投资组合卡片 + 计算工具参数面板布局统一化
> **对标参考**: testfol.io

---

## 1. 背景与问题

现有界面存在以下布局问题：

1. **投资组合卡片（PortfolioCard）**
   - 宽度固定 320px，在较窄屏幕上挤压错乱
   - 名称行、调仓频率、偏移量挤在一行，`flex-wrap` 导致视觉不统一
   - 操作按钮（复制/下载/删除）始终显示，占用名称行空间

2. **参数面板（BacktestParamsForm 及各工具页面）**
   - 参数行使用 `flex-wrap`，字段间距和高度不统一
   - 现金流区域与 testfol.io 的紧凑布局差距较大
   - `ToolPageLayout` 硬编码了一个"日期范围"选择器在标题栏，与参数面板里的日期选择重复

3. **按钮风格不统一**
   - `.btn-primary`、`.btn-upgrade`、`.btn-add-cashflow`、`.portfolios-add-btn` 等多种样式
   - 颜色、圆角、高度都不一致

4. **各计算工具页面各自为政**
   - 回测、蒙特卡洛、优化器、有效前沿、目标优化、PCA 都使用 `ComputeToolShell`，但参数面板没有统一布局组件

---

## 2. 设计目标

1. **统一性**：所有计算工具页面的参数面板使用同一种布局模式
2. **可维护性**：提取共享布局组件，改一处同步所有页面
3. **对标 testfol.io**：借鉴其布局逻辑（紧凑参数卡片、标签在上输入在下、分组清晰），保留现有配色主题
4. **修复错乱**：投资组合卡片自适应宽度、操作按钮 hover 显示、参数行对齐

---

## 3. 设计方案

### 3.1 核心组件体系

提取以下共享组件，位于 `packages/frontend/src/components/params/`：

| 组件           | 文件               | 职责                                           |
| -------------- | ------------------ | ---------------------------------------------- |
| `ParamSection` | `ParamSection.tsx` | 参数区域容器（深色圆角卡片，带标题行）         |
| `ParamRow`     | `ParamRow.tsx`     | 参数行（横向排列多个 ParamCard，flex 不 wrap） |
| `ParamCard`    | `ParamCard.tsx`    | 单个参数卡片（标签在上 + 输入控件在下）        |
| `ParamGroup`   | `ParamGroup.tsx`   | 可折叠参数分组（如"现金流"、"优化控制"）       |
| `ActionBar`    | `ActionBar.tsx`    | 底部操作栏（Run / Load Saved 等按钮）          |

### 3.2 ParamCard 结构

```
┌────────────────────────┐
│ Label（11px, muted）    │  ← label
│ ┌────────────────────┐ │
│ │ [input           ]   │ │  ← children（input/select/checkbox）
│ └────────────────────┘ │
└────────────────────────┘
```

- 宽度由父级 `ParamRow` 控制（通过 `grid` 或 `flex` 分配）
- 标签 `font-size: 11px`，`color: var(--text-muted)`，`font-weight: 500`
- 输入框继承现有 `.param-input` 样式
- 支持 `fullWidth` 属性占满整行

### 3.3 ParamRow 结构

- 使用 CSS Grid：`grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`
- 或固定列数：`grid-template-columns: repeat(6, 1fr)` 根据内容调整
- **不**使用 `flex-wrap`，避免行高错乱
- 移动端降级为单列

### 3.4 ParamGroup 结构

```
┌─────────────────────────────────────┐
│ ▼ Cashflow Legs          [badge 2] │  ← 可折叠标题行（带计数徽章）
├─────────────────────────────────────┤
│  ┌────────┐ ┌────────┐              │
│  │ Label  │ │ Label  │              │  ← ParamRow
│  │ [____] │ │ [____] │              │
│  └────────┘ └────────┘              │
└─────────────────────────────────────┘
```

- 默认折叠状态可配置
- 徽章显示组内有效参数数量

### 3.5 ActionBar 结构

```
┌─────────────────────────────────────┐
│ [RUN BACKTEST]        [LOAD SAVED ▼]│
└─────────────────────────────────────┘
```

- 主按钮（Run）：左侧，品牌色，方形圆角（`border-radius: 3px`）
- 次按钮（Load Saved）：右侧，灰色边框，与 testfol.io 一致
- 统一使用 `.btn-primary` 和 `.btn-secondary` 样式，移除其他按钮变体

### 3.6 投资组合卡片（PortfolioCard）修复

```
┌─────────────────────────────────┐
│ ┌────┐ ┌────┐ ┌────┐  ← hover 显示 │  ← 操作按钮行（默认隐藏）
│ │copy│ │dl │ │del │             │
│ └────┘ └────┘ └────┘             │
│ [Portfolio 1    ] [Rebalance ▼] │  ← 名称行（名称 + 调仓频率）
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Drag [0] %  ☑ Total return      │  ← 高级行（拖累 + 复选框）
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ [+ Add]                [Set ▼] │  ← 工具栏
│ ┌────────────┐ ┌────┐ ┌──┐     │
│ │ VTI        │ │ 60 │ │×│     │  ← Ticker 行
│ └────────────┘ └────┘ └──┘     │
│ ┌────────────┐ ┌────┐ ┌──┐     │
│ │ BND        │ │ 40 │ │×│     │
│ └────────────┘ └────┘ └──┘     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 合计                    100%   │  ← 总计行
└─────────────────────────────────┘
```

修复点：

- 卡片宽度：`min-width: 280px; flex: 1 1 280px`（自适应，不再固定 320px）
- 操作按钮行：默认 `opacity: 0`，hover 时 `opacity: 1`，过渡动画 0.15s
- 名称行：名称输入框占剩余空间，调仓频率固定宽度，不 wrap
- 高级行：固定高度，元素垂直居中
- 工具栏："+ Add" 左对齐，"Set" 下拉和总计右对齐

### 3.7 ToolPageLayout 修复

- 移除硬编码的"日期范围"选择器（与参数面板重复）
- 标题行右侧改为可配置的操作区（通过 props 传入）
- 参数卡片和结果卡片统一圆角 `border-radius: 20px`

---

## 4. 各页面适配

### 4.1 回测页面（BacktestPage）

参数面板使用 `ParamSection` + `ParamRow` + `ParamCard` 重构：

```
ParamSection(title="基本参数")
  ParamRow
    ParamCard(label="起始资金") -> StartingValueField
    ParamCard(label="货币") -> CurrencyField
    ParamCard(label="通胀调整") -> InflationToggle
    ParamCard(label="滚动窗口") -> RollingWindowField
    ParamCard(label="开始日期") -> DateInput
    ParamCard(label="结束日期") -> DateInput
    ParamCard(label="扩展提款统计") -> Checkbox
    ParamCard(label="基准") -> BenchmarkField

ParamGroup(title="现金流", defaultExpanded=true)
  ...

ActionBar
  [RUN BACKTEST] [LOAD SAVED ▼]
```

### 4.2 蒙特卡洛页面（MonteCarloPage）

```
ParamSection(title="Parameters")
  ParamRow
    ParamCard(label="Tickers") -> TickerInput
    ParamCard(label="Number of simulations") -> Select
    ParamCard(label="Random seed") -> Input

ParamGroup(title="Optimization Controls", defaultExpanded=true)
  ParamRow
    ParamCard(label="Primary Objective") -> Select
    ParamCard(label="Primary Percentile") -> Select
    ParamCard(label="Secondary Objective") -> Select
    ParamCard(label="Secondary Percentile") -> Select
    ParamCard(label="Solver") -> Select
    ParamCard(label="Solve speed") -> Select
    ParamCard(label="Min leverage") -> Input
    ParamCard(label="Max leverage") -> Input
  ParamRow
    ParamCard(label="Exposure limits") -> Checkbox
    ParamCard(label="Leverage constraints by ticker") -> Checkbox

ParamGroup(title="T-bill Rate Assumption", defaultExpanded=true)
  ...
```

### 4.3 其他页面

- **优化器（Optimizer）**：ParamSection + ParamGroup（目标函数、约束条件）
- **有效前沿（EfficientFrontier）**：ParamSection + ParamGroup（求解器设置）
- **目标优化（GoalOptimizer）**：ParamSection + ParamGroup（目标金额、约束）
- **PCA**：ParamSection（标的、日期、成分数）

所有页面都遵循同一模式：

1. `ParamSection` 作为最外层容器
2. `ParamRow` 排列基础参数
3. `ParamGroup` 折叠复杂参数
4. `ActionBar` 作为底部操作

---

## 5. CSS 调整

### 5.1 新增文件

`packages/frontend/src/styles/components-params.css`：

- `.param-section`：卡片容器样式
- `.param-row`：CSS Grid 参数行
- `.param-card`：单个参数卡片
- `.param-group`：可折叠分组
- `.param-group-header`：分组标题行
- `.action-bar`：底部操作栏
- `.btn-primary` / `.btn-secondary`：统一按钮样式

### 5.2 修改文件

`components-portfolio.css`：

- 修改 `.portfolio-card` 宽度为自适应
- 添加 `.portfolio-card-actions` hover 显示
- 修复 `.portfolio-card-name-row` 不 wrap

`components-backtest.css`：

- 移除 `.tool-page-date-range-select` 相关样式（硬编码日期选择器）
- 保留 `.bt-tabs`、`.result-content` 等结果区域样式

---

## 6. 测试策略

1. **视觉回归测试**：使用 Playwright 截图对比各工具页面参数面板
2. **响应式测试**：验证 1280px、1024px、768px、375px 下的布局
3. **交互测试**：验证 ParamGroup 折叠/展开、PortfolioCard hover 显示按钮
4. **功能测试**：确保参数值修改、表单提交不受影响

---

## 7. 风险与回滚

| 风险                           | 缓解措施                                              |
| ------------------------------ | ----------------------------------------------------- |
| 参数布局组件不适应某些特殊参数 | 保留 `ParamCard` 的 `children` 灵活性，支持自定义控件 |
| 移动端 Grid 布局降级问题       | 使用 `auto-fit` + `minmax`，确保小屏幕自动变单列      |
| 现有 CSS 样式冲突              | 新组件使用独立类名，旧样式逐步废弃                    |

回滚策略：

- 每个页面独立提交，可单独回滚
- 保留旧组件文件（重命名后缀 `.legacy.tsx`）一周后再删除

---

## 8. 附录：组件接口

### ParamCard

```typescript
interface ParamCardProps {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}
```

### ParamRow

```typescript
interface ParamRowProps {
  children: ReactNode;
  columns?: number; // 默认 auto-fit
}
```

### ParamGroup

```typescript
interface ParamGroupProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  badge?: number;
}
```

### ParamSection

```typescript
interface ParamSectionProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode; // 标题行右侧操作
}
```

### ActionBar

```typescript
interface ActionBarProps {
  primary: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
}
```
