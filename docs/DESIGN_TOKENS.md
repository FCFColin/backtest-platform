# 设计 Token 系统 (Design Tokens)

> 前端暗色金融平台主题系统，基于 CSS 变量 + Tailwind 配置。
> 源文件: `packages/frontend/src/index.css`、`tailwind.config.ts`、`packages/frontend/src/lib/chart-theme.ts`。

## 1. 主题基调

- **暗色单主题**：`html { color-scheme: dark; }`，无浅色切换
- **字体**：Geist Variable（正文）+ Geist Mono Variable（数字/代码），自托管于 @fontsource-variable/*
- **圆角基准**：`--radius: 0.5rem`（8px），shadcn 据此派生 `--radius-sm/md/lg/xl`
- **基调色相**：HSL 220-224（蓝灰），饱和度 9-15%

## 2. 颜色 Token（HSL 通道值）

定义在 `index.css` 的 `:root`，以 `H S% L%` 存储，使用时 `hsl(var(--token))` 拼接。

| 分组        | Token                                                                         | HSL（暗色）                                                 | HSL（亮色）   | Tailwind 类                 | 用途                                        |
| ----------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- | --------------------------- | ------------------------------------------- |
| 表面层      | `--app`                                                                       | `224 15% 5%`                                                | —             | `bg-app`                    | 应用根背景（最暗）                          |
|             | `--surface`                                                                   | `222 14% 8%`                                                | —             | `bg-surface`                | 卡片、面板底色                              |
|             | `--elevated`                                                                  | `222 13% 10%`                                               | —             | `bg-elevated`               | 浮层、dropdown、tooltip                     |
|             | `--input-bg`                                                                  | `220 13% 13%`                                               | —             | `bg-input-bg`               | 输入框、tab 条底色                          |
|             | `--hover`                                                                     | `222 13% 16%`                                               | —             | `bg-hover`                  | hover 态背景                                |
| 边框层      | `--border-subtle`                                                             | `222 15% 14%`                                               | —             | `border-subtle`             | 分隔线、表格行边                            |
|             | `--border`                                                                    | `222 14% 18%`                                               | —             | `border-border`             | 默认边框                                    |
|             | `--border-strong`                                                             | `222 15% 26%`                                               | —             | `border-strong`             | hover/强调边框                              |
| 文本层      | `--fg`                                                                        | `220 10% 92%`                                               | —             | `text-fg`                   | 主文本（最亮）                              |
|             | `--fg-secondary`                                                              | `220 9% 66%`                                                | —             | `text-fg-secondary`         | 次要文本、标签                              |
|             | `--fg-tertiary`                                                               | `220 9% 46%`                                                | —             | `text-fg-tertiary`          | 提示、占位符、表头                          |
|             | `--fg-disabled`                                                               | `220 9% 33%`                                                | —             | `text-fg-disabled`          | 禁用态文本                                  |
| 品牌色      | `--brand` / `-hover` / `-active` / `-fg`                                      | `217 91% 60%` / `221 83% 53%` / `224 76% 48%` / `0 0% 100%` | —             | `bg-brand*` / `text-brand*` | CTA、链接、focus ring 及态变                |
| 语义色      | `--success` / `--danger` / `--warning`                                        | `160 84% 39%` / `0 84% 60%` / `38 92% 50%`                  | —             | `text-success` 等           | 成功/错误/警告                              |
|             | `--pos` / `--neg`                                                             | `142 71% 45%` / `0 91% 71%`                                 | —             | `text-pos` / `text-neg`     | 涨幅（正相关）/ 跌幅（负相关）              |
| 表面扩展    | `--surface-raised`                                                            | `222 14% 10%`                                               | `0 0% 100%`   | `bg-surface-raised`         | Portfolio Card、KPI Card 凸起               |
|             | `--surface-sunken`                                                            | `224 20% 3%`                                                | `210 40% 94%` | `bg-surface-sunken`         | Footer、表头、凹陷区                        |
|             | `--sticky-bg`                                                                 | `222 14% 8%`                                                | `0 0% 100%`   | `bg-sticky-bg`              | Sticky ActionBar（配 `/95` + blur）         |
| subtle 变体 | `--brand-subtle` / `--brand-glow`                                             | `214 100% 60%`                                              | `217 91% 53%` | `bg-brand-subtle` 等        | 低饱和背景高亮（配 `hsl(var(--x) / 0.08)`） |
|             | `--success-subtle` / `--warning-subtle` / `--danger-subtle` / `--info-subtle` | 对应语义色                                                  | 对应亮色      | `bg-*-subtle`               | 状态背景高亮                                |

> **暗色品牌色微调**：暗色下 `--brand` 微调至 `214 100% 60%`（更接近金融冷蓝）。

### 图表专用配色（8 色循环 + 网格/Tooltip）

定义在 `tokens.css`，由 `chart-theme.ts` 的 `PORTFOLIO_COLORS` 消费。

| Token                | HSL（暗色）                                                                                                                 | HSL（亮色）                                                                                                                | 用途                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `--chart-1..8`       | `214 100% 60%` / `38 92% 50%` / `160 84% 39%` / `340 82% 60%` / `271 91% 65%` / `24 95% 53%` / `180 66% 45%` / `43 96% 56%` | `217 91% 53%` / `32 95% 44%` / `142 71% 36%` / `340 82% 52%` / `271 91% 55%` / `24 95% 50%` / `180 66% 38%` / `43 96% 48%` | 蓝/琥珀/翠绿/玫红/紫罗兰/橘红/青绿/金黄 |
| `--chart-grid`       | `222 15% 14%`                                                                                                               | `214 20% 88%`                                                                                                              | CartesianGrid 线条色                    |
| `--chart-tooltip-bg` | `222 20% 8%`                                                                                                                | `0 0% 100%`                                                                                                                | Tooltip 背景（配 `/0.95`）              |

## 3. shadcn 兼容映射

`index.css` 将原 token 映射到 shadcn 期望变量名（组件无需改动适配暗色）：

```
--background → --app        --primary / -fg → --brand / --brand-fg
--foreground → --fg         --secondary / -fg → --input-bg / --fg-secondary
--card / -fg → --surface/--fg  --muted / -fg → --input-bg / --fg-tertiary
--popover / -fg → --elevated/--fg  --accent / -fg → --hover / --fg
--destructive → --danger    --input → --border    --ring → --brand    --radius → 0.5rem
```

## 4. 字号阶梯（tailwind.config.ts fontSize）

对比度从 2:1 扩到 4:1（`display-xl` 44px vs `micro` 10px）。

| Token                                          | px/lh                            | 字重        | ls                 | 用途                             |
| ---------------------------------------------- | -------------------------------- | ----------- | ------------------ | -------------------------------- |
| `text-display-xl`                              | 44 / 1.05                        | 800         | -0.02em            | Hero 标题（桌面）                |
| `text-display`                                 | 32 / 1.15                        | 700         | -0.015em           | 大数字、KPI、Hero（移动）        |
| `text-h1` / `text-h2` / `text-h3`              | 24 / 1.25 / 18 / 1.35 / 15 / 1.4 | 700/600/600 | -0.01em/-0.005em/- | 页面主标题 / 区块标题 / 卡片标题 |
| `text-body` / `text-label` / `text-label-tiny` | 14 / 1.6 / 13 / 1.4 / 11 / 1.3   | 400/500/600 | - / - / 0.06em     | 正文 / 表单标签 / 微小标签       |
| `text-caption` / `text-micro`                  | 12 / 1.4 / 10 / 1.3              | 400/500     | - / 0.05em         | 辅助说明 / 状态徽章              |

> `display-xl` 在 `< md` 降级为 `display`：`<h1 className="text-display md:text-display-xl">`

## 5. 圆角阶梯

| Token          | 值  | 用途                | Token                   | 值            | 用途                     |
| -------------- | --- | ------------------- | ----------------------- | ------------- | ------------------------ |
| `rounded-none` | 0   | 表格、热力图        | `rounded-lg`            | 8px           | alert、dropdown、tooltip |
| `rounded-sm`   | 4px | badge、checkbox     | `rounded-xl`            | 12px          | card、dialog、sheet      |
| `rounded-md`   | 6px | 按钮、input、select | `rounded-2xl` / `-full` | 16px / 9999px | 大卡片 / pill            |

## 6. 动效

- `ease-out-quart` `cubic-bezier(0.16, 1, 0.3, 1)`；`duration-150` 默认过渡
- Recharts 动画用 tailwindcss-animate（`animate-in/out` + `fade-in-0`/`zoom-in-95`/`slide-in-from-*`）
- 自定义 keyframes：`accordion-down/up`（基于 `--radix-accordion-content-height`）

## 7. 字体

`fontFamily: { sans: ['Geist Variable', ...], mono: ['Geist Mono Variable', ...] }`；
`main.tsx` 导入两个 @fontsource-variable 包；`body { font-feature-settings: 'cv11','ss01','ss03'; }`；
数字用 `font-mono tabular-nums`。

## 8. 图表主题（chart-theme.ts）

P0-5 扩展：8 色组合配色、双向网格、backdrop-blur Tooltip、智能日期间隔、货币/百分比格式化器。

| 常量                                                   | 值                                                                                     | 用途                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------- |
| `CHART_TOOLTIP_STYLE`                                  | `bg: var(--chart-tooltip-bg)/0.95, border: var(--border-strong), blur(8px)`            | Tooltip 容器        |
| `CHART_MARGIN` / `CHART_GRID_PROPS`                    | `{top:20,right:40,bottom:20,left:80}` / `stroke var(--chart-grid) dasharray 3 3, 双向` | 边距 / 网格         |
| `AXIS_TICK_STYLE` / `LEGEND_WRAPPER_STYLE`             | `fill var(--fg-tertiary), 11px, mono` / `var(--fg-tertiary), 12px`                     | 坐标轴 / Legend     |
| `CHART_LINE_STYLE`                                     | `strokeWidth 2.5, dot:false, activeDot r4, 无动画`                                     | 主线条              |
| `PORTFOLIO_COLORS` / `getPortfolioColor(i)`            | 8 色数组 `hsl(var(--chart-N))` / `[i % 8]`                                             | 多组合循环配色      |
| `DATE_TICK_FORMATTER` / `YEAR_ONLY_TICK_FORMATTER`     | `slice(0,7)` / `slice(0,4)`                                                            | 刻度日期            |
| `SMART_DATE_INTERVAL(m)`                               | `≤12→1, ≤60→6, ≤120→12, ≤240→24, >240→60`                                              | 按月数自动选间隔    |
| `CURRENCY_TICK_FORMATTER` / `CURRENCY_EXACT_FORMATTER` | `Intl currency USD, 0/2 位小数`                                                        | Y 轴 / Tooltip 金额 |
| `PERCENT_TICK_FORMATTER`                               | `` `${value.toFixed(digits)}%` ``                                                      | 百分比（默认 2 位） |

相关系数热力图（`getCorrelationColor`）：强正相关 `#1a7a3a` → 中性 `var(--surface)` → 强负相关 `#8b2020`；9 级阶梯，阈值 ±[0.8, 0.6, 0.4, 0.2]。

## 9. 全局样式约定（index.css `@layer base`）

- `body { @apply bg-app text-fg font-sans antialiased; }`；`::placeholder` 用 `--fg-tertiary`
- 统一 focus ring：`*:focus-visible { @apply outline-none ring-2 ring-brand/50 ring-offset-2 ring-offset-app; }`
- `select` 自定义箭头（data URI SVG）、`input[type='date']` 图标反色
- `.num, .tabular`：mono + tabular-nums；`prefers-reduced-motion` 降速到 0.01ms

## 10. shadcn UI 组件（components/ui/，共 20 个）

| 组件                                                                                                                                         | 文件            | 主要导出                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------- |
| Button / Input / Label / Checkbox / Switch / Skeleton                                                                                        | `button.tsx` 等 | 同名组件；Button 含 `buttonVariants`（6 variants）   |
| Select / Dropdown Menu / Dialog / Sheet / Popover / Tooltip / Tabs / Radio Group / Collapsible / Progress / Separator / Badge / Card / Alert | `select.tsx` 等 | 标准 shadcn 全家桶（含各 Trigger/Content/Item 子件） |

## 11. 应用层组件

- **布局** `components/layout/`：`Navbar`（移动端 Sheet + 子菜单）、`Footer`、`ToolPageLayout`（工具页外壳）、`ToolSeoCard`、`NavGroupMenu`
- **表单** `components/form/`：`Field` 家族（react-hook-form 兼容）、`TickerTagInput`（Badge+Input）、`SegmentedControl`
- **状态**：`ErrorBanner`（RFC 7807 + degraded + 503 Retry-After）、`EmptyState`、`LoadingState`+`LoadingSpinner`、`CollapsibleSection`
- **业务**：`PortfolioEditor`/`PortfolioCard`（组合编辑）、`WeightInput`/`TickerInput`、`ChartCard`、`cards.tsx`（SectionTitle/PrefRow/StatCard）

## 12. 工具函数

`cn()`（`src/lib/utils.ts`）：clsx + tailwind-merge，自动去重冲突类（`px-2 px-4` → `px-4`）。

## 13. 禁用模式（Phase 5 验证通过，`src/` 中零出现）

| 模式                          | 原因             | 替代                 |
| ----------------------------- | ---------------- | -------------------- |
| `#000000`                     | 硬编码黑色       | `text-fg` / `bg-app` |
| `Inter` 字体名                | 已迁移 Geist     | `font-sans`          |
| `h-screen`                    | 移动端视口不一致 | `h-dvh`              |
| `bg-slate-*` / `text-slate-*` | 默认浅色 palette | 暗色 token           |
| 代码中 em-dash `—`            | 拼写规范         | `-`                  |

> **例外**：i18n 翻译文件与 JSDoc 中文注释保留 em-dash。

## 14. 验证命令

```powershell
npx tsc --noEmit -p tsconfig.frontend.json; npx vite build --config vite.config.ts
# 禁用模式 grep 验证：h-screen / bg-slate- / #000000 / Inter
```

## 15. 宽度约束系统（layout-widths.ts）

所有 `<Input>` 必须显式宽度类，CI 用 `check-input-widths.mjs` 强制检查。

| 组                             | 键 → 值                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INPUT_WIDTHS`                 | `ticker`→`w-[220px]`、`weight`→`w-[100px]`、`percent`→`w-[100px]`、`currency`→`w-[180px]`、`currencyLong`→`w-[220px]`、`date`→`w-[180px]`、`integer`→`w-[120px]`、`ratio`→`w-[120px]`、`select`→`w-[220px]`、`selectShort`→`w-[140px]`、`search`→`w-[320px]` |
| `CARD_WIDTHS`（min/ideal/max） | `portfolio` 320/380/460、`cashflow` 300/340/400、`saved` 260/300/340、`metric` 200/220/260、`hero` 300/340/400                                                                                                                                               |
| `CARD_GRID_CLASSES`            | `grid-cols-[repeat(auto-fill,minmax(Npx,1fr))]`（hero 用 `grid-cols-1 md:grid-cols-3`）                                                                                                                                                                      |
| `CONTAINER_WIDTHS`             | `page`→`max-w-[1440px] mx-auto px-6`、`content`→`max-w-[1280px]`、`narrow`→`max-w-[860px]`、`form`→`max-w-[720px]`                                                                                                                                           |

## 16. 迁移指南

1. **外壳**：工具页 `<ToolPageLayout params results />`，静态页加 `ToolSeoCard`
2. **分节**：独立区块用 `<Card className="p-5">`
3. **表单**：`<Field><FieldLabel/><Input/><FieldDescription/><FieldError/></Field>`
4. **数字/状态**：`<span className="font-mono tabular-nums">`；ErrorBanner/LoadingState/EmptyState
5. **响应式/i18n**：`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`；全部文案走 `t()`
6. **禁用**：`styles/*.css` 自定义类、`bg-slate-*`、`h-screen`、`#000000`、代码中 em-dash
