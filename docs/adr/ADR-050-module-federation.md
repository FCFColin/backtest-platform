# ADR-050: 微前端 Module Federation 架构预留

> **企业理由**：当前为单人团队，optimizer / signal-analyzer 仍作为 SPA 内页面部署。P3-02 要求"评估拆分需求（单人团队暂不拆，架构预留）"——需在构建层面预留 Module Federation 能力，避免未来团队/部署拆分时进行大范围入口与构建配置重构。

| 字段   | 值                                                       |
| ------ | -------------------------------------------------------- |
| 编号   | ADR-050                                                  |
| 状态   | 已接受                                                   |
| 日期   | 2026-07-25                                               |
| 决策者 | 架构组                                                   |
| 范围   | 前端构建（`vite.config.ts`）                             |
| 遵循   | P3-02 spec —— "评估拆分需求（单人团队暂不拆，架构预留）" |

## Context

当前前端为单一 Vite + React + TypeScript SPA，`optimizer` 与 `signal-analyzer` 页面与宿主同仓同构建产物部署。P3-02 评估结论：

1. **当前不拆**：单人团队下，独立部署 / 独立仓库的运维成本高于收益。
2. **架构预留**：未来若拆分为独立可部署的 remote（如 optimizer 子团队独立发版），需在构建层提前接入 Module Federation，否则届时需大范围改造入口、共享依赖与构建配置。

因此本 ADR 的目标是：在不改变当前单仓单构建部署的前提下，将 `OptimizerPage` 与 `SignalAnalyzerPage` 作为 Module Federation 的 **exposes** 暴露，使宿主未来可作为 remote provider；同时 `remotes` 暂为空，host 自身仍可被消费。

## Decision

采用 **`@originjs/vite-plugin-federation`**（Vite 原生 Module Federation 插件，`^1.3.5`）：

- `name: 'backtest_host'` —— 宿主唯一标识。
- `remotes: {}` —— 当前不消费任何远端模块；host 同时作为可被消费的 remote provider。
- `exposes`：
  - `./OptimizerPage` → `./packages/frontend/src/pages/optimizer/OptimizerPage.tsx`
  - `./SignalAnalyzerPage` → `./packages/frontend/src/pages/signal/SignalAnalyzerPage.tsx`
- `shared: ['react', 'react-dom', 'react-router-dom', 'zustand', 'i18next', 'react-i18next']` —— 共享依赖去重，要求未来各 remote 版本对齐。

### 构建侧约束

Module Federation 依赖动态 `import()` 与顶层模块加载能力，要求构建目标为 `esnext`，因此在 `vite.config.ts` 的 `build` 段补充：

- `target: 'esnext'` —— 放弃旧浏览器支持（内部工具，可接受）。
- `modulePreload: false` —— 关闭 module preload 注入，避免与 federation 运行时模块加载冲突。
- `cssCodeSplit: false` —— federation remote 加载时需单一 CSS 入口，关闭 CSS 拆分。

其余既有配置（alias、zustand ESM resolver、istanbul 覆盖率、proxy、manualChunks）保持不变，仅合并新增项。

### 单人团队范围

当前无任何 remote 部署：`remotes` 为空，宿主本地通过常规动态 `import()` 消费上述页面。`exposes` 配置仅为架构预留，不改变现有路由与页面装配，亦不引入额外的运行时开销。

## Consequences

- **优势**：
  - 未来拆分为独立 remote 时，仅需新增 `remotes` 条目与独立部署入口，无需改造页面模块结构。
  - `shared` 依赖去重避免 React 多实例问题。
  - Vite 原生插件，无额外运行时（对比 qiankun 的沙箱运行时）。
- **劣势 / 约束**：
  - 构建目标锁定 `esnext`，放弃旧浏览器支持（内部工具可接受）。
  - `shared` 依赖要求未来各 remote 版本对齐，否则去重失效甚至引发运行时冲突。
  - 单人团队当前不享受 remote 独立部署收益，仅承担预留成本。
- **风险**：
  - `exposes` 路径写死源码相对路径，若页面文件迁移需同步更新（由冒烟测试 `tests/unit/federation/federation-config.test.ts` 守护存在性）。
  - 未实际 remote 部署前，federation 运行时路径未经真实拆分验证（仅冒烟测试覆盖配置与文件存在性）。

## Alternatives Considered

| 方案                              | 结论 | 理由                                                       |
| --------------------------------- | ---- | ---------------------------------------------------------- |
| qiankun                           | 否决 | 需额外运行时沙箱，非 Vite 原生，对 Vite ESM 产物兼容性差。 |
| single-spa                        | 否决 | 样板代码更多，无共享依赖去重能力，需自行管理生命周期。     |
| 暂不接入 federation（等团队拆分） | 否决 | 届时需大范围改造构建与入口，违反 P3-02"架构预留"意图。     |

## References

- P3-02 spec —— "评估拆分需求（单人团队暂不拆，架构预留）"
- `@originjs/vite-plugin-federation`：<https://github.com/originjs/vite-plugin-federation>
- Vite Module Federation 概念：<https://vite.dev/guide/features.html>
