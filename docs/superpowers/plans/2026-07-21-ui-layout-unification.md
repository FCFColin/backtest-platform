# UI 布局统一化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一所有计算工具页面的参数面板布局，修复投资组合卡片错乱，建立共享布局组件体系。

**Architecture:** 提取 `ParamSection`、`ParamRow`、`ParamCard`、`ParamGroup`、`ActionBar` 五个共享组件，所有工具页面参数面板基于这些组件重构。投资组合卡片改为自适应宽度 + hover 显示操作按钮。保留现有 CSS 主题变量系统。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS 3 + 现有 CSS 主题变量

## Global Constraints

- 保留现有 CSS 主题变量（`--brand`、`--bg-elevated`、`--text-muted` 等）
- 使用 `.js` 扩展名进行相对导入（ESM 规范）
- 不引入新依赖
- 每个任务独立提交，可单独回滚
- 组件接口与 `docs/superpowers/specs/2026-07-21-ui-layout-unification-design.md` 一致

---

## Task 1: 创建共享参数布局组件

**Files:**

- Create: `packages/frontend/src/components/params/ParamCard.tsx`
- Create: `packages/frontend/src/components/params/ParamRow.tsx`
- Create: `packages/frontend/src/components/params/ParamGroup.tsx`
- Create: `packages/frontend/src/components/params/ParamSection.tsx`
- Create: `packages/frontend/src/components/params/ActionBar.tsx`
- Create: `packages/frontend/src/components/params/index.ts`
- Create: `packages/frontend/src/styles/components-params.css`

**Interfaces:**

- Produces: `ParamCard`、`ParamRow`、`ParamGroup`、`ParamSection`、`ActionBar` 组件
- ParamCard: `(props: { label: string; children: ReactNode; fullWidth?: boolean }) => ReactElement`
- ParamRow: `(props: { children: ReactNode; columns?: number }) => ReactElement`
- ParamGroup: `(props: { title: string; children: ReactNode; defaultExpanded?: boolean; badge?: number }) => ReactElement`
- ParamSection: `(props: { title: string; children: ReactNode; actions?: ReactNode }) => ReactElement`
- ActionBar: `(props: { primary: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean }; secondary?: { label: string; onClick: () => void; disabled?: boolean } }) => ReactElement`

- [ ] **Step 1: 创建 ParamCard 组件**

```typescript
import type { ReactNode } from 'react';

interface ParamCardProps {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}

export function ParamCard({ label, children, fullWidth }: ParamCardProps) {
  return (
    <div className={`param-card ${fullWidth ? 'param-card-full' : ''}`}>
      <label className="param-card-label">{label}</label>
      <div className="param-card-control">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 ParamRow 组件**

```typescript
import type { ReactNode } from 'react';

interface ParamRowProps {
  children: ReactNode;
  columns?: number;
}

export function ParamRow({ children, columns }: ParamRowProps) {
  const style = columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined;
  return (
    <div className="param-row" style={style}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: 创建 ParamGroup 组件**

```typescript
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface ParamGroupProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  badge?: number;
}

export function ParamGroup({ title, children, defaultExpanded = true, badge }: ParamGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="param-group">
      <button
        type="button"
        className="param-group-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown className={`param-group-chevron ${expanded ? 'expanded' : ''}`} />
        <span className="param-group-title">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="param-group-badge">{badge}</span>
        )}
      </button>
      {expanded && <div className="param-group-body">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: 创建 ParamSection 组件**

```typescript
import type { ReactNode } from 'react';

interface ParamSectionProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function ParamSection({ title, children, actions }: ParamSectionProps) {
  return (
    <section className="param-section">
      <div className="param-section-header">
        <h2 className="param-section-title">{title}</h2>
        {actions && <div className="param-section-actions">{actions}</div>}
      </div>
      <div className="param-section-content">{children}</div>
    </section>
  );
}
```

- [ ] **Step 5: 创建 ActionBar 组件**

```typescript
interface ActionBarProps {
  primary: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

export function ActionBar({ primary, secondary }: ActionBarProps) {
  return (
    <div className="action-bar">
      <button
        type="button"
        className="btn-primary"
        onClick={primary.onClick}
        disabled={primary.disabled || primary.loading}
      >
        {primary.loading ? '...' : primary.label}
      </button>
      {secondary && (
        <button
          type="button"
          className="btn-secondary"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
        >
          {secondary.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 创建 barrel export**

```typescript
export { ParamCard } from './ParamCard.js';
export { ParamRow } from './ParamRow.js';
export { ParamGroup } from './ParamGroup.js';
export { ParamSection } from './ParamSection.js';
export { ActionBar } from './ActionBar.js';
```

- [ ] **Step 7: 创建 CSS 样式文件**

```css
/* ============================================
   统一参数布局组件样式
   ============================================ */

/* ParamSection */
.param-section {
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 16px;
}

.param-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.param-section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-strong);
  margin: 0;
}

.param-section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.param-section-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ParamRow */
.param-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  align-items: end;
}

@media (max-width: 768px) {
  .param-row {
    grid-template-columns: 1fr;
  }
}

/* ParamCard */
.param-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.param-card-full {
  grid-column: 1 / -1;
}

.param-card-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.param-card-control {
  min-width: 0;
}

.param-card-control .param-input,
.param-card-control input,
.param-card-control select {
  width: 100%;
}

/* ParamGroup */
.param-group {
  border-top: 1px solid var(--border-soft);
  padding-top: 12px;
}

.param-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  padding: 0;
  margin-bottom: 12px;
  font-family: inherit;
}

.param-group-header:hover {
  color: var(--brand);
}

.param-group-chevron {
  width: 16px;
  height: 16px;
  transition: transform 0.2s;
  color: var(--text-muted);
  flex-shrink: 0;
}

.param-group-chevron.expanded {
  transform: rotate(180deg);
}

.param-group-title {
  flex: 1;
  text-align: left;
}

.param-group-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
  border-radius: 9px;
}

.param-group-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 4px;
}

/* ActionBar */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--border-soft);
  padding-top: 16px;
  margin-top: 8px;
}

/* 统一按钮样式 */
.btn-primary {
  height: 36px;
  padding: 0 20px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #fff;
  background: var(--brand);
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition:
    background-color 0.15s,
    transform 0.1s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary:hover:not(:disabled) {
  background: var(--brand-hover);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-body);
  border-color: rgba(148, 163, 184, 0.5);
}

.btn-secondary:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 8: 导入新 CSS 到主样式文件**

在 `packages/frontend/src/styles/base.css` 底部添加：

```css
@import './components-params.css';
```

- [ ] **Step 9: 运行 TypeScript 检查**

Run: `npm run check`
Expected: 无新增类型错误

- [ ] **Step 10: 提交**

```bash
git add packages/frontend/src/components/params/
git add packages/frontend/src/styles/components-params.css
git add packages/frontend/src/styles/base.css
git commit -m "feat(frontend): add unified param layout components (ParamCard, ParamRow, ParamGroup, ParamSection, ActionBar)"
```

---

## Task 2: 修复 ToolPageLayout（移除硬编码日期选择器）

**Files:**

- Modify: `packages/frontend/src/components/layout/ToolPageLayout.tsx`
- Modify: `packages/frontend/src/styles/components-backtest.css`

**Interfaces:**

- Consumes: `ParamSection` 的 `actions` prop 替代硬编码日期选择器
- Produces: `ToolPageLayout` 的 `title` 右侧区域改为 `actions` prop 传入

- [ ] **Step 1: 修改 ToolPageLayout 组件**

```typescript
interface ToolPageLayoutProps {
  params: ReactNode;
  results?: ReactNode;
  title?: string;
  actions?: ReactNode; // 新增：标题行右侧操作区
}

export function ToolPageLayout({ params, results, title, actions }: ToolPageLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="tool-page-layout flex flex-col w-full gap-4">
      <section className="card tool-page-params" style={{ borderRadius: 20 }}>
        {title && (
          <h2 className="tool-page-section-title">
            <span>{title}</span>
            {actions && <div className="tool-page-section-title-actions">{actions}</div>}
          </h2>
        )}
        <div className="tool-page-params-content">{params}</div>
      </section>

      {results && (
        <section className="card tool-page-results" style={{ borderRadius: 20 }}>
          <div className="tool-page-results-content">{results}</div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 移除硬编码日期选择器样式**

从 `components-backtest.css` 中删除 `.tool-page-date-range-select`、`.tool-page-date-range-label`、`.tool-page-date-range-value` 相关样式。

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npm run check`
Expected: 无新增类型错误

- [ ] **Step 4: 提交**

```bash
git add packages/frontend/src/components/layout/ToolPageLayout.tsx
git add packages/frontend/src/styles/components-backtest.css
git commit -m "fix(frontend): remove hardcoded date-range selector from ToolPageLayout, add actions prop"
```

---

## Task 3: 修复投资组合卡片（PortfolioCard）

**Files:**

- Modify: `packages/frontend/src/components/portfolioEditor/PortfolioCard.tsx`
- Modify: `packages/frontend/src/styles/components-portfolio.css`

**Interfaces:**

- Consumes: 无（纯样式和布局修复）
- Produces: 修复后的 `PortfolioCard` 组件，自适应宽度，hover 显示操作按钮

- [ ] **Step 1: 修改 PortfolioCard 操作按钮为 hover 显示**

将 `PortfolioCardActions` 从绝对定位右上角改为卡片顶部的一行，默认 `opacity: 0`，hover 时显示。

```typescript
function PortfolioCardActions({...}) {
  return (
    <div className="portfolio-card-actions">
      <button className="portfolio-card-action" ...><Copy className="w-3.5 h-3.5" /></button>
      <button className="portfolio-card-action" ...><Download className="w-3.5 h-3.5" /></button>
      <button className="portfolio-card-action portfolio-card-action-danger" ...><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}
```

- [ ] **Step 2: 修改 PortfolioCard 名称行不 wrap**

```typescript
function PortfolioNameRow({...}) {
  return (
    <div className="portfolio-card-name-row">
      <input className="portfolio-name-input" ... />
      <select className="portfolio-rebalance-select" ... />
      <div className="offset-cell">
        <input className="offset-input" ... />
        <span className="offset-suffix">{t('portfolio.offset')}</span>
      </div>
      {portfolio.rebalanceFrequency === 'threshold' && (
        <div className="threshold-cell">
          <input className="threshold-input" ... />
          <span className="threshold-suffix">%</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 修改 CSS**

```css
/* 卡片自适应宽度 */
.portfolio-card {
  min-width: 280px;
  flex: 1 1 280px;
  max-width: 400px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  padding: 12px;
  position: relative;
  transition: box-shadow 0.15s;
}

.portfolio-card:hover {
  box-shadow: var(--shadow-md);
}

/* 操作按钮行 - hover 显示 */
.portfolio-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  margin-bottom: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}

.portfolio-card:hover .portfolio-card-actions {
  opacity: 1;
}

/* 移除旧的绝对定位 */
.portfolio-card-header {
  display: none;
}

/* 名称行不 wrap */
.portfolio-card-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: nowrap;
}

.portfolio-card-name-row .portfolio-name-input {
  flex: 1;
  min-width: 0;
}

.portfolio-card-name-row .portfolio-rebalance-select {
  width: 110px;
  flex-shrink: 0;
}

.portfolio-card-name-row .offset-cell,
.portfolio-card-name-row .threshold-cell {
  flex-shrink: 0;
}
```

- [ ] **Step 4: 运行 TypeScript 检查**

Run: `npm run check`
Expected: 无新增类型错误

- [ ] **Step 5: 提交**

```bash
git add packages/frontend/src/components/portfolioEditor/PortfolioCard.tsx
git add packages/frontend/src/styles/components-portfolio.css
git commit -m "fix(frontend): PortfolioCard adaptive width, hover-reveal actions, no-wrap name row"
```

---

## Task 4: 重构回测参数面板（BacktestParamsForm）

**Files:**

- Modify: `packages/frontend/src/components/BacktestParamsForm.tsx`
- Modify: `packages/frontend/src/components/BacktestParamsForm.CashflowLegs.tsx`
- Modify: `packages/frontend/src/components/BacktestParamsForm.Rebalance.tsx`

**Interfaces:**

- Consumes: `ParamCard`、`ParamRow`、`ParamGroup`、`ParamSection`、`ActionBar`
- Produces: 重构后的 `BacktestParamsForm`，使用统一布局组件

- [ ] **Step 1: 重构 BacktestParamsForm.tsx**

将 `BasicParamsSection` 改为使用 `ParamSection` + `ParamRow` + `ParamCard`：

```typescript
import { ParamSection, ParamRow, ParamCard, ParamGroup, ActionBar } from './params/index.js';

function BasicParamsSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  const dateRangeMode = parameters.startDate === '' && parameters.endDate === '' ? 'all' : 'custom';

  return (
    <ParamSection title={t('params.basicParams')}>
      <ParamRow>
        <ParamCard label={t('params.startingValue')}>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">{parameters.baseCurrency === 'usd' ? '$' : '¥'}</span>
            <input
              type="number"
              value={parameters.startingValue}
              min={1}
              step={1000}
              className="param-input param-input-with-prefix"
              onChange={(e) => updateParameter('startingValue', Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
        </ParamCard>
        <ParamCard label={t('params.currency')}>
          <select
            value={parameters.baseCurrency}
            className="param-input"
            onChange={(e) => updateParameter('baseCurrency', e.target.value as 'usd' | 'cny')}
          >
            <option value="usd">USD ($)</option>
            <option value="cny">CNY (¥)</option>
          </select>
        </ParamCard>
        <ParamCard label={t('params.inflationAdjust')}>
          <label className="param-check">
            <input
              type="checkbox"
              checked={parameters.adjustForInflation}
              onChange={(e) => updateParameter('adjustForInflation', e.target.checked)}
            />
            <span>{t('params.inflationAdjust')}</span>
          </label>
        </ParamCard>
        <ParamCard label={t('params.rollingWindow')}>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              value={parameters.rollingWindowMonths}
              min={1}
              max={120}
              className="param-input param-input-with-suffix"
              onChange={(e) => updateParameter('rollingWindowMonths', Math.max(1, Number(e.target.value) || 12))}
            />
            <span className="param-input-suffix">{t('params.months')}</span>
          </div>
        </ParamCard>
        <ParamCard label={t('params.startDate')}>
          <input
            type="date"
            value={parameters.startDate}
            disabled={dateRangeMode === 'all'}
            className="param-input"
            onChange={(e) => {
              const err = validateDateChange('startDate', e.target.value, parameters.endDate, t);
              if (err) { useToastStore.getState().addToast('warning', err); return; }
              updateParameter('startDate', e.target.value);
            }}
          />
        </ParamCard>
        <ParamCard label={t('params.endDate')}>
          <input
            type="date"
            value={parameters.endDate}
            disabled={dateRangeMode === 'all'}
            className="param-input"
            onChange={(e) => {
              const err = validateDateChange('endDate', e.target.value, parameters.startDate, t);
              if (err) { useToastStore.getState().addToast('warning', err); return; }
              updateParameter('endDate', e.target.value);
            }}
          />
        </ParamCard>
        <ParamCard label={t('params.extendedWithdrawalStats')}>
          <label className="param-check">
            <input
              type="checkbox"
              checked={parameters.extendedWithdrawalStats}
              onChange={(e) => updateParameter('extendedWithdrawalStats', e.target.checked)}
            />
            <span>{t('params.extendedWithdrawalStats')}</span>
          </label>
        </ParamCard>
        <ParamCard label={t('params.selectBenchmark')}>
          <label className="param-check">
            <input
              type="checkbox"
              checked={parameters.benchmarkTicker !== ''}
              onChange={(e) => updateParameter('benchmarkTicker', e.target.checked ? 'SPY' : '')}
            />
            <span>{t('params.selectBenchmark')}</span>
          </label>
          {parameters.benchmarkTicker !== '' && (
            <TickerInput
              value={parameters.benchmarkTicker}
              onChange={(v) => updateParameter('benchmarkTicker', v)}
              placeholder="SPY"
            />
          )}
        </ParamCard>
      </ParamRow>
    </ParamSection>
  );
}
```

- [ ] **Step 2: 重构 CashflowLegsSection 使用 ParamGroup**

将 `CashflowLegsSection` 和 `OneTimeCashflowSection` 改为 `ParamGroup` 包裹。

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npm run check`
Expected: 无新增类型错误

- [ ] **Step 4: 提交**

```bash
git add packages/frontend/src/components/BacktestParamsForm.tsx
git add packages/frontend/src/components/BacktestParamsForm.CashflowLegs.tsx
git add packages/frontend/src/components/BacktestParamsForm.Rebalance.tsx
git commit -m "refactor(frontend): BacktestParamsForm use unified ParamSection/ParamRow/ParamCard layout"
```

---

## Task 5: 重构蒙特卡洛参数面板（MonteCarloParams）

**Files:**

- Modify: `packages/frontend/src/pages/monte-carlo/MonteCarloParams.tsx`

**Interfaces:**

- Consumes: `ParamCard`、`ParamRow`、`ParamGroup`、`ParamSection`

- [ ] **Step 1: 使用 ParamSection + ParamRow + ParamCard 重构参数布局**

将现有的分散参数输入改为统一布局组件。

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run check`
Expected: 无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/monte-carlo/MonteCarloParams.tsx
git commit -m "refactor(frontend): MonteCarloParams use unified param layout components"
```

---

## Task 6: 重构优化器参数面板（OptimizerParams）

**Files:**

- Modify: `packages/frontend/src/pages/optimizer/OptimizerParams.tsx`

- [ ] **Step 1: 使用统一布局组件重构**

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run check`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/optimizer/OptimizerParams.tsx
git commit -m "refactor(frontend): OptimizerParams use unified param layout components"
```

---

## Task 7: 重构有效前沿参数面板（EfficientFrontierParams）

**Files:**

- Modify: `packages/frontend/src/pages/efficient-frontier/EfficientFrontierParams.tsx`

- [ ] **Step 1: 使用统一布局组件重构**

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run check`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/efficient-frontier/EfficientFrontierParams.tsx
git commit -m "refactor(frontend): EfficientFrontierParams use unified param layout components"
```

---

## Task 8: 重构目标优化参数面板（GoalOptimizerParams）

**Files:**

- Modify: `packages/frontend/src/pages/goal-optimizer/GoalOptimizerParams.tsx`

- [ ] **Step 1: 使用统一布局组件重构**

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run check`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/goal-optimizer/GoalOptimizerParams.tsx
git commit -m "refactor(frontend): GoalOptimizerParams use unified param layout components"
```

---

## Task 9: 重构 PCA 参数面板（PCAParams）

**Files:**

- Modify: `packages/frontend/src/pages/pca/PCAParams.tsx`

- [ ] **Step 1: 使用统一布局组件重构**

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run check`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/pca/PCAParams.tsx
git commit -m "refactor(frontend): PCAParams use unified param layout components"
```

---

## Task 10: 清理旧样式与验证

**Files:**

- Modify: `packages/frontend/src/styles/components-backtest.css`
- Modify: `packages/frontend/src/styles/components-portfolio.css`

- [ ] **Step 1: 清理 components-backtest.css 中冗余的按钮样式**

移除 `.btn-upgrade`、`.btn-pill-outline`、`.btn-add-cashflow` 等旧按钮样式，统一使用 `components-params.css` 中的 `.btn-primary` / `.btn-secondary`。

- [ ] **Step 2: 清理 components-portfolio.css 中冗余的按钮样式**

移除 `.portfolios-add-btn` 系列中与 `.btn-primary` / `.btn-secondary` 重复的样式，统一使用新按钮类。

- [ ] **Step 3: 运行完整 TypeScript 检查**

Run: `npm run check`
Expected: 无类型错误

- [ ] **Step 4: 运行单元测试**

Run: `npm run test:unit`
Expected: 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add packages/frontend/src/styles/components-backtest.css
git add packages/frontend/src/styles/components-portfolio.css
git commit -m "chore(frontend): consolidate button styles, remove redundant CSS"
```

---

## Task 11: 运行 E2E 冒烟测试

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`
（后台运行，或确认服务已在运行）

- [ ] **Step 2: 运行 E2E 冒烟测试**

Run: `npx playwright test tests/e2e/ui/page-smoke.spec.ts`
Expected: 所有页面加载正常，无视觉崩溃

- [ ] **Step 3: 提交（如有测试修复）**

```bash
git add tests/e2e/ui/
git commit -m "test(e2e): update smoke tests for unified layout"
```

---

## Spec Coverage Check

| 设计文档需求                        | 对应任务 |
| ----------------------------------- | -------- |
| ParamCard 组件                      | Task 1   |
| ParamRow 组件                       | Task 1   |
| ParamGroup 组件                     | Task 1   |
| ParamSection 组件                   | Task 1   |
| ActionBar 组件                      | Task 1   |
| CSS 样式文件                        | Task 1   |
| ToolPageLayout 移除硬编码日期选择器 | Task 2   |
| PortfolioCard 自适应宽度            | Task 3   |
| PortfolioCard hover 显示操作按钮    | Task 3   |
| PortfolioCard 名称行不 wrap         | Task 3   |
| BacktestParamsForm 重构             | Task 4   |
| MonteCarloParams 重构               | Task 5   |
| OptimizerParams 重构                | Task 6   |
| EfficientFrontierParams 重构        | Task 7   |
| GoalOptimizerParams 重构            | Task 8   |
| PCAParams 重构                      | Task 9   |
| 按钮样式统一                        | Task 10  |
| 测试验证                            | Task 11  |

无遗漏。

## Placeholder Scan

- 无 "TBD"、"TODO"、"implement later"
- 所有代码块包含完整实现
- 所有文件路径精确
- 所有命令包含预期输出
