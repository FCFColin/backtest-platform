# 设计 Token 系统 (Design Tokens)

> 前端暗色金融平台主题系统，基于 CSS 变量 + Tailwind 配置。
> 源文件: `packages/frontend/src/index.css`、`tailwind.config.ts`、`packages/frontend/src/lib/chart-theme.ts`。
> 本文档反映前端全站重构后的实际 token 现状（`docs/FRONTEND_REFACTOR_PLAN.md` Phase 0-6 已执行完毕）。

## 1. 主题基调

- **暗色单主题**：`html { color-scheme: dark; }`，无浅色主题切换
- **字体**：Geist Variable（正文）+ Geist Mono Variable（数字/代码），通过 `@fontsource-variable/geist` 与 `@fontsource-variable/geist-mono` 自托管
- **圆角基准**：`--radius: 0.5rem`（8px），shadcn 组件据此派生 `--radius-sm/md/lg/xl`
- **基调色相**：HSL 220-224（蓝灰），饱和度 9-15%

## 2. 颜色 Token（HSL 通道值）

定义在 `packages/frontend/src/index.css` 的 `:root`，全部以 `H S% L%` 形式存储，使用时通过 `hsl(var(--token))` 拼接。

### 2.1 表面层（4 级渐变）

| Token        | HSL           | Tailwind 类   | 用途                    |
| ------------ | ------------- | ------------- | ----------------------- |
| `--app`      | `224 15% 5%`  | `bg-app`      | 应用根背景（最暗）      |
| `--surface`  | `222 14% 8%`  | `bg-surface`  | 卡片、面板底色          |
| `--elevated` | `222 13% 10%` | `bg-elevated` | 浮层、dropdown、tooltip |
| `--input-bg` | `220 13% 13%` | `bg-input-bg` | 输入框、tab 条底色      |
| `--hover`    | `222 13% 16%` | `bg-hover`    | hover 态背景            |

### 2.2 边框层（3 级）

| Token             | HSL           | Tailwind 类                | 用途                 |
| ----------------- | ------------- | -------------------------- | -------------------- |
| `--border-subtle` | `222 15% 14%` | `border-subtle`            | 分隔线、表格行边     |
| `--border`        | `222 14% 18%` | `border` / `border-border` | 默认边框             |
| `--border-strong` | `222 15% 26%` | `border-strong`            | hover 边框、强调边框 |

### 2.3 文本层（4 级）

| Token            | HSL           | Tailwind 类         | 用途               |
| ---------------- | ------------- | ------------------- | ------------------ |
| `--fg`           | `220 10% 92%` | `text-fg`           | 主文本（最亮）     |
| `--fg-secondary` | `220 9% 66%`  | `text-fg-secondary` | 次要文本、标签     |
| `--fg-tertiary`  | `220 9% 46%`  | `text-fg-tertiary`  | 提示、占位符、表头 |
| `--fg-disabled`  | `220 9% 33%`  | `text-fg-disabled`  | 禁用态文本         |

### 2.4 品牌色

| Token            | HSL           | Tailwind 类               | 用途                     |
| ---------------- | ------------- | ------------------------- | ------------------------ |
| `--brand`        | `217 91% 60%` | `bg-brand` / `text-brand` | 主 CTA、链接、focus ring |
| `--brand-hover`  | `221 83% 53%` | `bg-brand-hover`          | hover 态                 |
| `--brand-active` | `224 76% 48%` | `bg-brand-active`         | active 态                |
| `--brand-fg`     | `0 0% 100%`   | `text-brand-fg`           | brand 背景上的文字       |

### 2.5 语义色

| Token       | HSL           | Tailwind 类                   | 用途                 |
| ----------- | ------------- | ----------------------------- | -------------------- |
| `--success` | `160 84% 39%` | `text-success` / `bg-success` | 成功、正向趋势       |
| `--danger`  | `0 84% 60%`   | `text-danger` / `bg-danger`   | 错误、删除、负向趋势 |
| `--warning` | `38 92% 50%`  | `text-warning`                | 警告、降级提示       |
| `--pos`     | `142 71% 45%` | `text-pos`                    | 涨幅、正相关         |
| `--neg`     | `0 91% 71%`   | `text-neg`                    | 跌幅、负相关         |

## 3. shadcn 兼容映射

`index.css` 中将上述原 token 映射到 shadcn 期望的语义变量名，使 shadcn 组件无需改动即可适配暗色主题：

```
--background → --app
--foreground → --fg
--card / --card-foreground → --surface / --fg
--popover / --popover-foreground → --elevated / --fg
--primary / --primary-foreground → --brand / --brand-fg
--secondary / --secondary-foreground → --input-bg / --fg-secondary
--muted / --muted-foreground → --input-bg / --fg-tertiary
--accent / --accent-foreground → --hover / --fg
--destructive / --destructive-foreground → --danger / 0 0% 98%
--input → --border
--ring → --brand
--radius → 0.5rem
```

## 4. 字号阶梯

定义在 `tailwind.config.ts` 的 `theme.extend.fontSize`：

| Token          | px / line-height | 字重 | 用途                |
| -------------- | ---------------- | ---- | ------------------- |
| `text-display` | 32 / 1.15        | 700  | 大数字、KPI 值      |
| `text-h1`      | 24 / 1.25        | 600  | 页面主标题          |
| `text-h2`      | 18 / 1.4         | 600  | 区块标题            |
| `text-h3`      | 15 / 1.4         | 600  | 卡片标题、子区标题  |
| `text-body`    | 14 / 1.6         | 400  | 正文（默认）        |
| `text-label`   | 13 / 1.4         | 500  | 表单标签            |
| `text-caption` | 12 / 1.4         | 400  | 辅助说明、表头、tag |

## 5. 圆角阶梯

| Token          | 值     | 用途                          |
| -------------- | ------ | ----------------------------- |
| `rounded-none` | 0      | 表格、热力图                  |
| `rounded-sm`   | 4px    | badge、checkbox               |
| `rounded-md`   | 6px    | 按钮、input、select trigger   |
| `rounded-lg`   | 8px    | alert、dropdown item、tooltip |
| `rounded-xl`   | 12px   | card、dialog、sheet           |
| `rounded-2xl`  | 16px   | 大卡片                        |
| `rounded-full` | 9999px | pill、status dot              |

## 6. 动效

| Token            | 值                              | 用途         |
| ---------------- | ------------------------------- | ------------ |
| `ease-out-quart` | `cubic-bezier(0.16, 1, 0.3, 1)` | 标准过渡曲线 |
| `duration-150`   | 150ms                           | 默认过渡时长 |

Recharts 动画使用 tailwindcss-animate 插件提供 `animate-in` / `animate-out` + `fade-in-0` / `zoom-in-95` / `slide-in-from-*`。

自定义 keyframes：

- `accordion-down` / `accordion-up`（基于 `--radix-accordion-content-height`，用于 CollapsibleSection）

## 7. 字体

定义在 `tailwind.config.ts` 的 `theme.extend.fontFamily`：

```ts
fontFamily: {
  sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  mono: ['Geist Mono Variable', 'ui-monospace', 'monospace'],
}
```

`main.tsx` 中导入：

```ts
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
```

字体特性：`body { font-feature-settings: 'cv11', 'ss01', 'ss03'; }`

数字使用 `font-mono tabular-nums`（等宽数字对齐表格）。

## 8. 图表主题

源文件：`packages/frontend/src/lib/chart-theme.ts`

| 常量                   | 值                                                                        | 用途                  |
| ---------------------- | ------------------------------------------------------------------------- | --------------------- |
| `CHART_TOOLTIP_STYLE`  | `bg: var(--elevated)`, `border: var(--border-subtle)`, `color: var(--fg)` | Recharts Tooltip 容器 |
| `CHART_MARGIN`         | `{top:5, right:30, bottom:5, left:60}`                                    | 图表通用边距          |
| `CHART_GRID_PROPS`     | `stroke: var(--border-subtle)`, `strokeWidth: 1`                          | CartesianGrid         |
| `AXIS_TICK_STYLE`      | `fill: var(--fg-tertiary)`, `fontSize: 11`                                | 坐标轴刻度            |
| `LEGEND_WRAPPER_STYLE` | `color: var(--fg-tertiary)`, `fontSize: 12`                               | Legend 容器           |
| `DATE_TICK_FORMATTER`  | `value.slice(0, 7)`                                                       | YYYY-MM 截取          |

相关系数热力图配色（`getCorrelationColor`）：

- 强正相关 `#1a7a3a` → 中性 `var(--surface)` → 强负相关 `#8b2020`
- 9 级阶梯，阈值 `[0.8, 0.6, 0.4, 0.2]` 与 `[-0.8, -0.6, -0.4, -0.2]`

## 9. 全局样式约定

`packages/frontend/src/index.css` 中 `@layer base`：

- `body { @apply bg-app text-fg font-sans antialiased; }` - 默认暗色背景
- `::placeholder { color: hsl(var(--fg-tertiary)); }` - 占位符色
- `*:focus-visible { @apply outline-none ring-2 ring-brand/50 ring-offset-2 ring-offset-app; }` - 统一 focus ring
- `select` 自定义箭头（data URI SVG，避免 native appearance）
- `input[type='date']` 日历图标反色处理
- `.num, .tabular` 工具类：`font-family: 'Geist Mono Variable'; font-variant-numeric: tabular-nums;`
- `@media (prefers-reduced-motion: reduce)` 全局降速到 0.01ms

## 10. shadcn UI 组件清单

路径：`packages/frontend/src/components/ui/`，共 **20 个**组件：

| 组件          | 文件                | 主要导出                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button        | `button.tsx`        | Button, buttonVariants (variants: primary/secondary/ghost/outline/destructive/icon)                                                                                                                                                                                                                                       |
| Input         | `input.tsx`         | Input                                                                                                                                                                                                                                                                                                                     |
| Label         | `label.tsx`         | Label                                                                                                                                                                                                                                                                                                                     |
| Select        | `select.tsx`        | Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectGroup, SelectLabel, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton                                                                                                                                                                    |
| Checkbox      | `checkbox.tsx`      | Checkbox                                                                                                                                                                                                                                                                                                                  |
| Switch        | `switch.tsx`        | Switch                                                                                                                                                                                                                                                                                                                    |
| Card          | `card.tsx`          | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter                                                                                                                                                                                                                                                     |
| Badge         | `badge.tsx`         | Badge, badgeVariants                                                                                                                                                                                                                                                                                                      |
| Separator     | `separator.tsx`     | Separator                                                                                                                                                                                                                                                                                                                 |
| Collapsible   | `collapsible.tsx`   | Collapsible, CollapsibleTrigger, CollapsibleContent                                                                                                                                                                                                                                                                       |
| Dropdown Menu | `dropdown-menu.tsx` | DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup |
| Dialog        | `dialog.tsx`        | Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription                                                                                                                                                                                |
| Sheet         | `sheet.tsx`         | Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetOverlay (CVA side: top/bottom/left/right)                                                                                                                                                                     |
| Skeleton      | `skeleton.tsx`      | Skeleton                                                                                                                                                                                                                                                                                                                  |
| Alert         | `alert.tsx`         | Alert, AlertTitle, AlertDescription (variants: default/destructive)                                                                                                                                                                                                                                                       |
| Tooltip       | `tooltip.tsx`       | Tooltip, TooltipTrigger, TooltipContent, TooltipProvider                                                                                                                                                                                                                                                                  |
| Tabs          | `tabs.tsx`          | Tabs, TabsList, TabsTrigger, TabsContent                                                                                                                                                                                                                                                                                  |
| Progress      | `progress.tsx`      | Progress                                                                                                                                                                                                                                                                                                                  |
| Popover       | `popover.tsx`       | Popover, PopoverTrigger, PopoverContent                                                                                                                                                                                                                                                                                   |
| Radio Group   | `radio-group.tsx`   | RadioGroup, RadioGroupItem                                                                                                                                                                                                                                                                                                |

## 11. 应用层组件清单

### 11.1 布局组件（`components/layout/`）

| 组件             | 用途                                                       |
| ---------------- | ---------------------------------------------------------- |
| `Navbar`         | 顶部导航栏（Sheet 移动端折叠 + DropdownMenu 子菜单）       |
| `Footer`         | 页脚（响应式 grid）                                        |
| `ToolPageLayout` | 工具页统一外壳（params Card + results Card + afterParams） |
| `ToolSeoCard`    | SEO 描述卡（features grid + related links）                |
| `NavGroupMenu`   | 导航分组下拉菜单                                           |

### 11.2 表单组件（`components/form/`）

| 组件                                                       | 用途                                        |
| ---------------------------------------------------------- | ------------------------------------------- |
| `Field` + `FieldLabel` + `FieldDescription` + `FieldError` | 统一表单 Field 包装（兼容 react-hook-form） |
| `TickerTagInput`                                           | 资产标签输入（Badge + Input + 关闭按钮）    |
| `SegmentedControl`                                         | 分段控件                                    |

### 11.3 状态组件

| 组件                              | 路径                                | 用途                                                   |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `ErrorBanner`                     | `components/ErrorBanner.tsx`        | RFC 7807 错误展示 + degraded warning + 503 Retry-After |
| `EmptyState`                      | `components/EmptyState.tsx`         | 空状态（icon + title + description + action）          |
| `LoadingState` + `LoadingSpinner` | `components/LoadingState.tsx`       | 加载状态（Loader2 animate-spin）                       |
| `CollapsibleSection`              | `components/CollapsibleSection.tsx` | 可折叠区块（chevron 旋转）                             |

### 11.4 业务组件

| 组件              | 路径                                           | 用途                                            |
| ----------------- | ---------------------------------------------- | ----------------------------------------------- |
| `PortfolioEditor` | `components/PortfolioEditor.tsx`               | 多/单组合编辑器                                 |
| `PortfolioCard`   | `components/portfolioEditor/PortfolioCard.tsx` | 组合卡片（Card + Glidepath + Assets + Footer）  |
| `WeightInput`     | `components/WeightInput.tsx`                   | 权重数字输入（tabular-nums）                    |
| `TickerInput`     | `components/TickerInput.tsx`                   | 标的代码输入                                    |
| `ChartCard`       | `components/ChartCard.tsx`                     | 图表卡片容器（Card + CardHeader + CardContent） |
| `cards.tsx`       | `components/cards.tsx`                         | SectionTitle + PrefRow + StatCard               |

## 12. 工具函数

### `cn()` - `packages/frontend/src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

合并 Tailwind 类名，自动去重冲突类（如 `px-2 px-4` → `px-4`）。

## 13. 禁用模式（Phase 5 验证通过）

以下模式在 `packages/frontend/src` 中已**零出现**：

| 模式                          | 原因                      | 替代方案                      |
| ----------------------------- | ------------------------- | ----------------------------- |
| `#000000`                     | 硬编码黑色                | `text-fg` / `bg-app`          |
| `Inter` 字体名                | 已迁移到 Geist            | `font-sans`（Geist Variable） |
| `h-screen`                    | 移动端视口不一致          | `h-dvh`                       |
| `bg-slate-*` / `text-slate-*` | Tailwind 默认浅色 palette | 暗色 token                    |
| 代码中 em-dash `—`            | 拼写规范                  | 普通连字符 `-`                |

> **例外**：i18n JSON 翻译文件（`translation.json`）与 JSDoc 中文注释中保留 em-dash，属于内容/排版范畴，不在禁用范围。

## 14. 验证命令

```powershell
# 类型检查
npx tsc --noEmit -p tsconfig.frontend.json

# 构建
npx vite build --config vite.config.ts

# 禁用模式 grep 验证（应全部无匹配）
# h-screen / bg-slate- / #000000 / Inter (字体)
```

## 15. 迁移指南

新增页面/组件时遵循：

1. **外壳**：工具页用 `<ToolPageLayout params={...} results={...} />`，静态页用 `<ToolPageLayout params={...} />` + `ToolSeoCard`
2. **分节**：每个独立区块用 `<Card className="p-5">` 包裹
3. **表单**：`<Field><FieldLabel>...</FieldLabel><Input/><FieldDescription>...</FieldDescription><FieldError>...</FieldError></Field>`
4. **数字**：`<span className="font-mono tabular-nums">{value}</span>`
5. **状态**：错误用 `ErrorBanner`，加载用 `LoadingState`，空数据用 `EmptyState`
6. **响应式**：`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
7. **i18n**：所有文案走 `t()`，不要硬编码
8. **不要**使用：`styles/*.css` 自定义类、`bg-slate-*`、`h-screen`、`#000000`、代码中 em-dash
