# 前端全站重构 Pre-Flight 自查报告

> 执行对象：`docs/FRONTEND_REFACTOR_PLAN.md` Phase 0-6
> 执行日期：2026-07-24
> 执行方式：sub-agent 并行派发（共 17 个 sub-agent，分 6 个 Phase）
> 报告生成时间：Phase 6 完成后

## 1. Phase 执行清单

| Phase          | 任务                                                                                                                          | Sub-agent 数 | 验证 Gate          | 状态    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ | ------- |
| Phase 0        | 地基（tailwind/index.css/utils.ts/components.json/main.tsx）                                                                  | -            | tsc + build exit 0 | ✅ 完成 |
| Phase 1A       | shadcn UI batch 1（select/checkbox/switch/collapsible/dropdown-menu）                                                         | 1            | tsc exit 0         | ✅ 完成 |
| Phase 1B       | shadcn UI batch 2（dialog/sheet/tooltip/popover/radio-group）                                                                 | 1            | tsc exit 0         | ✅ 完成 |
| Phase 2        | lib/chart-theme.ts + 迁移 chartColors/chartConstants                                                                          | 1            | tsc exit 0         | ✅ 完成 |
| Phase 1+2 Gate | 合并验证                                                                                                                      | -            | tsc + build exit 0 | ✅ 通过 |
| Phase 3A       | layout 组件就地重构（Navbar/Footer/ToolPageLayout/NavGroupMenu）                                                              | 1            | tsc exit 0         | ✅ 完成 |
| Phase 3B       | form/utility 组件就地重构 + 新建（ErrorBanner/TickerTagInput/WeightInput + Field/EmptyState/LoadingState/CollapsibleSection） | 1            | tsc exit 0         | ✅ 完成 |
| Phase 3C       | card 组件就地重构（cards.tsx + PortfolioCard）                                                                                | 1            | tsc exit 0         | ✅ 完成 |
| Phase 3 Gate   | 合并验证                                                                                                                      | -            | tsc + build exit 0 | ✅ 通过 |
| Phase 4        | 页面重构（9 个并行 sub-agent）                                                                                                | 9            | tsc + build exit 0 | ✅ 完成 |
| Phase 4 Gate   | 合并验证                                                                                                                      | -            | tsc + build exit 0 | ✅ 通过 |
| Phase 5        | 全站通检（admin 暗色统一 + em-dash 清理 + grep 验证）                                                                         | 2            | tsc + build + grep | ✅ 完成 |
| Phase 6        | 交付 DESIGN_TOKENS.md + 自查报告                                                                                              | -            | -                  | ✅ 完成 |

## 2. 交付物清单

### 2.1 设计系统基础设施

- `tailwind.config.ts`（替换原 `.js`，99 行）—— token 体系 + Geist 字体 + 自定义 keyframes
- `packages/frontend/src/index.css`（106 行）—— CSS 变量 + shadcn 兼容映射 + 全局样式
- `packages/frontend/src/lib/utils.ts` —— `cn()` 工具
- `packages/frontend/src/lib/chart-theme.ts`（116 行）—— 图表主题（合并自 chartColors.ts + chartConstants.ts，已删除原文件）
- `components.json` —— shadcn 配置（new-york style, slate baseColor, cssVariables）
- `index.html` —— 移除 Google Fonts（Inter + JetBrains Mono）
- `packages/frontend/src/main.tsx` —— 导入 Geist fontsource + 清理 CSS 导入
- `packages/frontend/src/styles/base.css` —— 移除冲突 body 样式

### 2.2 shadcn UI 组件层（20 个）

路径：`packages/frontend/src/components/ui/`

| 组件              | 行数 |
| ----------------- | ---- |
| alert.tsx         | 62   |
| badge.tsx         | -    |
| button.tsx        | 95   |
| card.tsx          | 91   |
| checkbox.tsx      | 38   |
| collapsible.tsx   | 31   |
| dialog.tsx        | 149  |
| dropdown-menu.tsx | 255  |
| input.tsx         | 38   |
| label.tsx         | -    |
| popover.tsx       | 38   |
| progress.tsx      | -    |
| radio-group.tsx   | 54   |
| select.tsx        | 209  |
| separator.tsx     | -    |
| sheet.tsx         | 166  |
| skeleton.tsx      | -    |
| switch.tsx        | 41   |
| tabs.tsx          | -    |
| tooltip.tsx       | 37   |

### 2.3 应用组件层

#### 就地重构

- `components/layout/Navbar.tsx`（178 行，原 128 行）
- `components/layout/Footer.tsx`（85 行）
- `components/layout/ToolPageLayout.tsx`（147 行，合并了原 ToolSeoCard.ts）
- `components/layout/NavGroupMenu.tsx`（115 行，合并了原 navConfig.ts）
- `components/ErrorBanner.tsx`（215 行，RFC 7807 + degraded + 503 Retry-After）
- `components/form/TickerTagInput.tsx`（112 行）
- `components/WeightInput.tsx`（64 行，shadcn Input + tabular-nums）
- `components/cards.tsx`（57 行，新增 StatCard 导出）
- `components/portfolioEditor/PortfolioCard.tsx`（350 行）
- `components/portfolioEditor/PortfolioAssets.tsx`（重构为 HoldingRow 风格）
- `components/PortfolioEditor.tsx`（重构 + 修复 variant=link 错误）
- `components/portfolioEditor/GlidepathComponents.tsx`（补全 shadcn 导入）
- `components/ChartCard.tsx`（shadcn Card 包装）

#### 新建

- `components/form/Field.tsx`（73 行）—— Field + FieldLabel + FieldDescription + FieldError
- `components/EmptyState.tsx`（49 行）
- `components/LoadingState.tsx`（57 行）—— LoadingState + LoadingSpinner
- `components/CollapsibleSection.tsx`（74 行）

### 2.4 页面重构（15+ 页面族，9 个 sub-agent 并行）

| 页面族                                               | 文件数 | 主要变更                                                 |
| ---------------------------------------------------- | ------ | -------------------------------------------------------- |
| backtest（含 optimizer 子页）                        | 15+    | ToolPageLayout + Card + Field + HoldingRow + StatCard    |
| analysis                                             | 6      | ToolPageLayout + Tabs + Card                             |
| monte-carlo + efficient-frontier                     | 13     | ToolPageLayout + Tabs + Card + chart-theme               |
| optimizer + goal-optimizer                           | 6      | ToolPageLayout + Card + Field                            |
| pca + factor-regression                              | 8      | ToolPageLayout + Card + CollapsibleSection               |
| signal（3 子页）                                     | 11     | ToolPageLayout + Card + Tabs                             |
| tactical（含 grid 子页）                             | 9      | ToolPageLayout + Card + Tabs + StatCard                  |
| calculators + letf                                   | 11     | ToolPageLayout + Card + Field                            |
| data-engine + content + auth + account + org + admin | 25+    | Card + Field + 暗色 token（admin 从 slate palette 迁移） |

### 2.5 文档

- `docs/DESIGN_TOKENS.md` —— token 系统完整文档
- `docs/FRONTEND_REFACTOR_SELFCHECK.md` —— 本报告

## 3. 验证结果

### 3.1 TypeScript 类型检查

```
npx tsc --noEmit -p tsconfig.frontend.json
EXIT=0
```

### 3.2 Vite 生产构建

```
npx vite build --config vite.config.ts
✓ built in 8.47s
EXIT=0
```

构建产物（关键 chunk）：

- `index-*.js`: 473.67 kB (gzip: 150.17 kB)
- `react-vendor-*.js`: 353.69 kB (gzip: 110.72 kB)
- `chart-vendor-*.js`: 458.99 kB (gzip: 122.73 kB)
- `BacktestPage-*.js`: 72.96 kB (gzip: 12.21 kB)

### 3.3 禁用模式 grep 验证

| 模式                          | 匹配数                         | 状态    |
| ----------------------------- | ------------------------------ | ------- |
| `h-screen`                    | 0                              | ✅      |
| `bg-slate-*` / `text-slate-*` | 0                              | ✅      |
| `#000000`                     | 0                              | ✅      |
| `Inter` 字体引用              | 0                              | ✅      |
| 代码中 em-dash `—`            | 0                              | ✅      |
| i18n JSON 中 em-dash          | 保留（i18n preservation rule） | ✅ 例外 |
| JSDoc 注释中 em-dash          | 保留（中文排版习惯）           | ✅ 例外 |

## 4. 与原 plan 的差异

### 4.1 路径修正

- 前端代码在 `packages/frontend/src/` 而非 `src/`（monorepo）
- `@/` alias 解析到 `packages/frontend/src/*`
- tailwind content 路径包含 `./packages/frontend/src/**`
- `index.html` 在项目根目录（vite root）

### 4.2 端口修正

- 前端端口 15173（`VITE_PORT`），非 5001
- 后端 API 端口 15001（`API_PORT`）

### 4.3 组件策略修正

- **就地重构**现有组件，非新建 `components/app/*` 平行层
- 用户确认：重构 + 精简并重

### 4.4 shadcn 安装方式修正

- 因 monorepo alias 解析问题，放弃 shadcn CLI，**手写**所有 UI 组件
- 总计 20 个组件（plan 中为 17 个，实际按需补齐 select/checkbox/switch）

### 4.5 i18n 处理修正

- 保留 `t()` 调用，不硬编码中文
- 翻译文件中的 em-dash 保留（i18n preservation）

### 4.6 CSS 处理修正

- 渐进迁移：保留 `styles/*.css`，按需删除无引用文件
- 已删除：`components-common-navbar.css`、`components-common-footer.css`
- 大部分 `styles/*.css` 仍被间接引用，未强制删除

### 4.7 WeightInput 范围修正

- 原 plan 标注 WeightInput 为 "HoldingRow"（行容器），实际代码为单输入
- 处理：保持向后兼容 props（仅 value/onChange），新增 ticker/onDelete 可选 props 支持行模式
- PortfolioAssets.tsx 调用方未强制改动（避免破坏其他调用方）

### 4.8 cards.tsx 范围修正

- 原 plan 标注 "StatCard / cards"，实际 cards.tsx 仅含 SectionTitle + PrefRow
- 处理：在 cards.tsx 新增 StatCard 导出（label + value + trend + icon）

## 5. 文件长度约束

AGENTS.md 约定单文件 ≤ 500 行。验证：

- 所有重构后的 .tsx 文件均 ≤ 500 行
- 最大文件：`pages/admin/DataManagement.tsx`（420 行）、`components/portfolioEditor/PortfolioCard.tsx`（350 行）

## 6. 已知遗留 / 未完成项

### 6.1 styles/*.css 渐进迁移 —— 已完成（2026-07-24 精简批次）

- 已删除 9 个 ORPHAN CSS 文件（components-backtest*.css × 4 + components-portfolio*.css × 4 + components-params.css）
- 已清理 utilities.css 死类（7/8 死类删除，仅保留 .bt-page media query）
- 已清理 components-common-base.css 死类（.skeleton-bar + .asset-tag + @keyframes skeleton-shimmer）
- 剩余 6 个 .css 文件均为活跃引用（base.css / components-common.css / components-common-base.css / components-common-buttons.css / components-common-tables.css / utilities.css）

### 6.2 WeightInput HoldingRow 下沉未完成

- WeightInput 仍是单输入，未完全下沉为 HoldingRow
- PortfolioAssets.tsx 仍分别使用 TickerInput + WeightInput + 删除按钮
- 后续若需统一，需同时重构 PortfolioAssets 调用方

### 6.3 部分页面未深层重构

- content 页面（About/Help/Changelog/Contact）仅做 token 化，未做页面级结构重排
- account/org 页面仅轻量重构
- 后续可按 testfol.io 风格进一步重排

### 6.4 A11y 自动化测试未执行

- 本报告仅做 grep 验证 + tsc + build
- 未执行 axe-core 或 Playwright A11y 自动化扫描
- 建议后续接入 `@axe-core/playwright` 跑 E2E A11y 测试

### 6.5 死代码精简批次（2026-07-24 新增）

**批次1：ORPHAN CSS 删除**（9 文件，~1500 行）

- components-backtest.css / components-backtest-layout.css / components-backtest-params.css / components-backtest-results.css
- components-params.css
- components-portfolio.css / components-portfolio-inputs.css / components-portfolio-cards.css / components-portfolio-advanced.css

**批次2：未使用 shadcn 组件删除**（3 文件，224 行）

- ui/dialog.tsx（149 行）—— 零引用，sheet.tsx 直接从 @radix-ui/react-dialog 导入
- ui/popover.tsx（38 行）—— 零引用
- ui/tooltip.tsx（37 行）—— 零引用

**批次3：CSS 死类清理**（2 文件，~60 行）

- utilities.css：29 → 9 行（删除 7 个死类，保留 .bt-page）
- components-common-base.css：删除 .skeleton-bar + @keyframes skeleton-shimmer + @media reduced-motion + .asset-tag × 3 选择器

**批次4：package.json 未使用依赖清理**（3 包）

- @radix-ui/react-alert-dialog —— alert.tsx 不依赖此包（仅 cva + cn）
- @radix-ui/react-popover —— popover.tsx 删除后无使用方
- @radix-ui/react-tooltip —— tooltip.tsx 删除后无使用方
- pnpm-lock.yaml 已同步（Packages: +9 -9）

**精简效果**：

- CSS 产物：63.22 kB → 61.26 kB（-1.96 kB，-3.1%）
- 源文件 LOC：删除 ~1800 行死代码
- 依赖树：移除 3 个未使用 radix 包及其 transitive 依赖

## 7. 重构 LOC 变化（采样）

| 文件                        | 重构前 | 重构后 | Δ                                      |
| --------------------------- | ------ | ------ | -------------------------------------- |
| Navbar.tsx                  | 128    | 178    | +50（Sheet 移动端折叠 + DropdownMenu） |
| Footer.tsx                  | -      | 85     | -                                      |
| ToolPageLayout.tsx          | -      | 147    | 合并了原 ToolSeoCard.ts                |
| ErrorBanner.tsx             | -      | 215    | +RFC 7807 + degraded + 503             |
| EfficientFrontierShared.tsx | 203    | 131    | -72 (-35%)                             |
| OptimizerResults.tsx        | 346    | 265    | -81 (-23%)                             |
| GoalOptimizerResults.tsx    | 268    | 233    | -35 (-13%)                             |
| FactorRegressionParams.tsx  | 244    | 179    | -65 (-27%)                             |
| tacticalGridUtils.ts        | 182    | 150    | -32 (-18%)                             |

整体趋势：

- shadcn 化的组件 LOC 略增（CVA + forwardRef + JSDoc 模式更冗长）
- 页面级重构显著减少 LOC（消除内联样式 + 重复布局壳）
- 净 LOC 变化因页面而异，整体控制在 ±10% 内

## 8. 后续建议

1. **CSS 渐进清理**：按页排查 `styles/*.css`，删除确认无引用的文件
2. **A11y 自动化**：接入 `@axe-core/playwright` 跑 E2E
3. **响应式回归**：用 Playwright 跑 mobile/tablet/desktop 三档视口截图对比
4. **性能基线**：建立 Lighthouse 基线，对比重构前后 LCP/CLS/INP
5. **WeightInput 下沉**：若决定统一为 HoldingRow，同步重构 PortfolioAssets 调用方
6. **i18n em-dash 审计**：若需进一步统一，可批量替换 translation.json 中的 em-dash 为连字符

## 9. Pre-Flight 通过声明

- [x] TypeScript 类型检查通过（tsc --noEmit exit 0）
- [x] Vite 生产构建通过（build exit 0）
- [x] 禁用模式 grep 验证通过（h-screen / bg-slate / #000000 / Inter / 代码 em-dash / 已删 radix 包 均为 0）
- [x] 单文件 ≤ 500 行约束满足
- [x] i18n `t()` 调用全部保留
- [x] hook 逻辑全部保留
- [x] DESIGN_TOKENS.md 已交付
- [x] 自查报告已交付
- [x] 死代码精简批次完成（4 批次，删除 ~1800 行死代码 + 3 个未使用依赖包）
- [x] pnpm-lock.yaml 已同步

**Pre-Flight 状态：通过 ✅（含 2026-07-24 精简批次）**
