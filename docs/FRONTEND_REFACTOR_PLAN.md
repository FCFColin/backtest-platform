# 前端全站重构执行计划（修正版）

> 本文档是 `tmp.md` + `tmp2.md` 的**修正集成版**，基于代码库实际探索修正路径、端口、组件迁移策略。
> 详细组件/页面规范见 `tmp.md` §4-§6 与 `tmp2.md` §5-§8。

## 0. 关键修正（基于代码库探索）

| 项 | plan 原值 | 修正值 | 原因 |
|---|---|---|---|
| 前端端口 | 5001 | **15173**（`VITE_PORT`） | vite.config.ts 实际值 |
| 后端 API 端口 | 5001 | **15001**（`API_PORT`） | vite.config.ts proxy |
| tailwind 配置 | `tailwind.config.ts` | **`tailwind.config.ts`**（替换 `.js`） | 现有为 `.js`，需改为 `.ts` |
| tailwind content | `./src/**` | `./packages/frontend/src/**` + `./index.html` | monorepo 路径 |
| `@/` alias | `src/*` | `packages/frontend/src/*` | tsconfig.frontend.json |
| 组件策略 | 新建 `components/app/*` | **就地重构**现有组件 | 用户确认：重构+精简并重 |
| CSS 处理 | 替换为单一 index.css | **渐进迁移**：保留 styles/*.css，逐页移除规则 | 用户确认 |
| 字体 | 下载 woff2 到 public/fonts | **`@fontsource-variable/geist`** 包 | 已安装，self-host via npm |
| i18n | 硬编码中文 | **保留 `t()` 调用** | 用户确认 |
| index.html 位置 | `src/` | `./index.html`（项目根） | vite root |

## 1. 就地重构文件映射

| plan 组件 | 现有文件 | 操作 |
|---|---|---|
| AppNav | `components/layout/Navbar.tsx` | 就地重构（token + shadcn Button） |
| Footer | `components/layout/Footer.tsx` | 就地重构 |
| PageHeader | `components/layout/ToolPageLayout.tsx` | 就地重构 |
| ErrorAlert | `components/ErrorBanner.tsx` | 就地重构（RFC 7807 + 503） |
| AssetChipInput | `components/form/TickerTagInput.tsx` | 就地重构 |
| HoldingRow | `components/WeightInput.tsx` | 就地重构 |
| PortfolioCard | `components/portfolioEditor/PortfolioCard.tsx` | 就地重构 |
| StatCard / cards | `components/cards.tsx` | 就地重构 |
| LoadingState | 新建 `components/LoadingState.tsx` | 无现有对应 |
| Field 系列 | 新建 `components/form/Field*.tsx` | 无现有对应 |
| EmptyState | 新建 `components/EmptyState.tsx` | 无现有对应 |
| CollapsibleSection | 新建 `components/CollapsibleSection.tsx` | 无现有对应 |
| chart-theme | `components/charts/chartColors.ts` | 就地重构合并 |

## 2. 执行 Gate 序列

```
Phase 0 地基（硬串行）→ 验证 Gate: tsc + vite build 通过
  ├─ Phase 1 shadcn ui 层 ─┐
  │                        ├─→ 验证 Gate: tsc 通过
  └─ Phase 2 chart 主题 ───┘   （与 Phase 1 并行）
          ↓
Phase 3 应用组件层（Phase 1 后，3 subagent 并行）→ 验证 Gate: tsc 通过
          ↓
Phase 4 页面重构（Phase 3 后，subagent 并行批）→ 验证 Gate: tsc + build
          ↓
Phase 5 全站通检（响应式 + A11y + Copy audit）
          ↓
Phase 6 Pre-Flight + 交付 DESIGN_TOKENS.md
```

## 3. Phase 0 地基清单

1. `index.html`：删除 Google Fonts（Inter + JetBrains Mono）
2. `tailwind.config.ts`：新建（替换 `.js`），完整 token 系统（§2.2）
3. `packages/frontend/src/index.css`：完整 token 系统 + Geist font-face（§2.1）
4. `packages/frontend/src/main.tsx`：清理 CSS 导入，改用 `@fontsource-variable/geist`
5. `packages/frontend/src/lib/utils.ts`：`cn()` 函数
6. `components.json`：shadcn 配置（baseColor=slate, cssVariables=true）
7. 验证：`npm run check`（tsc）+ `vite build`

## 4. Phase 1 shadcn 组件清单（17 个）

手写（非 CLI，因 monorepo alias 问题）到 `packages/frontend/src/components/ui/`：
button, input, label, select, checkbox, switch, card, badge, separator,
collapsible, dropdown-menu, dialog, sheet, skeleton, alert, tooltip, tabs,
progress, popover, radio-group

按 `tmp.md` §4 定制 CVA。

## 5. 验证命令

```powershell
npm run check        # tsc --noEmit（全项目）
npm run lint         # ESLint
cd packages/frontend && npx tsc --noEmit -p ../../tsconfig.frontend.json  # 前端类型检查
npx vite build --config ../../vite.config.ts   # 前端构建
```

## 6. 文件长度约束

- 单文件 ≤ 500 行（AGENTS.md 约定）
- 超出则有机拆分，避免机械切割

## 7. 交付物

1. `tailwind.config.ts` + `index.css` 覆盖
2. `components.json`
3. `components/ui/*`（17 个，已定制 CVA）
4. 应用组件（就地重构 + 新建）
5. `lib/chart-theme.ts` + `lib/utils.ts`
6. 15+ 页面重构
7. `DESIGN_TOKENS.md`
8. Pre-Flight 自查报告
