# ADR-050: 微前端 Module Federation 架构预留

> **企业理由**：当前为单人团队，optimizer / signal-analyzer 仍作为 SPA 内页面部署。P3-02 要求"评估拆分需求（单人团队暂不拆，架构预留）"——需在构建层面预留 Module Federation 能力，避免未来团队/部署拆分时进行大范围入口与构建配置重构。

| 字段   | 值                         |
| ------ | -------------------------- |
| 编号   | ADR-050                    |
| 状态   | 已接受                     |
| 日期   | 2026-07-25                 |
| 决策者 | 架构组                     |
| 范围   | 前端构建（vite.config.ts） |

## Context

当前前端为单一 Vite + React + TypeScript SPA，optimizer 与 signal-analyzer 页面与宿主同仓同构建产物部署。当前不拆（单人团队下独立部署运维成本高于收益），但需架构预留：未来若拆分为独立可部署的 remote，需在构建层提前接入 Module Federation，否则届时需大范围改造入口、共享依赖与构建配置。

## Decision

采用 @originjs/vite-plugin-federation（^1.3.5）：

- name: backtest_host；remotes: {}（当前不消费远端模块，host 同时作为可被消费的 remote provider）
- exposes: ./OptimizerPage → OptimizerPage.tsx、./SignalAnalyzerPage → SignalAnalyzerPage.tsx
- shared: ['react', 'react-dom', 'react-router-dom', 'zustand', 'i18next', 'react-i18next']（共享依赖去重，要求未来各 remote 版本对齐）
- 构建约束：target: 'esnext'（放弃旧浏览器，内部工具可接受）、modulePreload: false（避免与 federation 运行时冲突）、cssCodeSplit: false（federation remote 需单一 CSS 入口）

放弃 qiankun（需额外运行时沙箱，非 Vite 原生）、single-spa（样板代码多，无共享依赖去重）、暂不接入 federation（届时需大范围改造，违反"架构预留"意图）。

## Consequences

- (+) 未来拆分为独立 remote 时，仅需新增 remotes 条目与独立部署入口，无需改造页面模块结构
- (+) shared 依赖去重避免 React 多实例问题；Vite 原生插件无额外运行时
- (-) 构建目标锁定 esnext，放弃旧浏览器支持
- (-) shared 依赖要求未来各 remote 版本对齐，否则去重失效甚至引发运行时冲突
- (-) 单人团队当前不享受 remote 独立部署收益，仅承担预留成本
- (-) 未实际 remote 部署前，federation 运行时路径未经真实拆分验证（仅冒烟测试覆盖配置与文件存在性）
