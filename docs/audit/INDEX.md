# 审计目录索引 (Audit Index)

> v3.0 审计·修复·强化项目的所有审计产物索引。

## 目录结构

```
docs/audit/
  INDEX.md            # 本文件
  screenshots/        # 所有截图，命名 {task-id}-{before|after}-{page-slug}.png
  reports/            # 所有验证脚本输出的 JSON 报告
  network/            # Network 请求录制
```

## 命名规范

- 截图：`{task-id}-{before|after}-{page-slug}.png`（如 `p0-1-a-after-backtest.png`）
- 报告：`{task-id}-report.json` 或 `{task-id}-baseline.json`
- Network：`{task-id}-{endpoint}.json`

## 审计脚本（npm run audit:*）

| 命令                     | 脚本                                   | 用途                                    | 依赖            |
| ------------------------ | -------------------------------------- | --------------------------------------- | --------------- |
| `npm run audit:i18n`     | `scripts/verify-i18n.mjs`              | i18n 双语 key 同步 + 源码使用 key 校验  | 无              |
| `npm run audit:contract` | `scripts/verify-backtest-contract.mjs` | 后端回测数据契约验证（CAGR/MDD 单位）   | 后端 API + DB   |
| `npm run audit:dom`      | `scripts/audit-page-dom.mjs`           | 20+ 页面 DOM 健康度（H1/i18n/NaN/空白） | 前端 dev server |
| `npm run audit:code`     | `scripts/audit-code-static.mjs`        | 静态代码审计（deprecated/V1V2/硬编码）  | 无              |
| `npm run audit:all`      | 上述四个顺序执行                       | 全量审计                                | 全部            |

## Task IDs

### P0 阶段（审计与止血）

- `p0-0-1` — 创建审计目录（本任务）
- `p0-0-2` — verify-i18n.mjs
- `p0-0-3` — verify-backtest-contract.mjs（baseline: `p0-0-3-baseline.json`）
- `p0-0-4` — audit-page-dom.mjs（baseline: `p0-0-4-baseline.json`）
- `p0-0-5` — audit-code-static.mjs（baseline: `p0-0-5-code-audit.json`）
- `p0-1-a` — Go 引擎 Statistics 字段单位标准化
- `p0-1-b` — 前端渲染层单位适配（formatters.ts）
- `p0-1-c` — 回撤片段字段补全 + NaN 修复
- `p0-2-a` — i18n 补齐 undefined key
- `p0-2-b` — i18n 清理未使用 key + 规范文档
- `p0-3` — H1 重复修复 + PageHero 组件
- `p0-4` — 空白空间根治
- `p0-5` — 删除 V1 组件残留

### P1 阶段（视觉与信息密度）

- `p1-1` — 字号阶梯全站生效
- `p1-2` — Floating Label 全站生效
- `p1-3` — Portfolio 卡片对象化验收
- `p1-4` — 统计表横向 17 列验收
- `p1-5` — 图表专业化验收
- `p1-6` — Navbar 3 分组验收

### P2 阶段（数据丰富度）

- `p2-0` — Ticker 元数据 API
- `p2-1` — 合成标的 UI 展示
- `p2-2` — Footer 数据接入
- `p2-3` — 数据引擎页排序修复

### P3 阶段（产品活力）

- `p3-1` — Announcements 系统全流程
- `p3-2` — ResultsActionBar sticky
- `p3-3` — 回撤片段时间轴打磨
- `p3-4` — 多组合对比模式

## 验收状态

| 阶段 | 验收脚本            | 状态   | Tag                |
| ---- | ------------------- | ------ | ------------------ |
| P0   | `npm run audit:all` | 待执行 | `v3.0-p0-complete` |
| P1   | DOM 断言 + 截图     | 待执行 | `v3.0-p1-complete` |
| P2   | API curl + DOM 断言 | 待执行 | `v3.0-p2-complete` |
| P3   | 全量 audit:all      | 待执行 | `v3.0-final`       |
