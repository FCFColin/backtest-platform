# ADR-017: 退役悬空 verify-backend 与 verify-frontend 脚本

| 状态 | 已接受 | 日期 | 2026-08-15 | 合并 | — | 关联 | ADR-009, ADR-012 |

## Context

`scripts/verify/verify-backend.mjs`（C-001 migrations / C-002 RLS）与 `scripts/verify/verify-frontend.mjs`（C-004 登录链接 / C-005 起始资金默认值 / C-006 CLS）在 CI 中从不执行：`ci.yml` 以 `--skip-db --skip-frontend` 跳过（PR 无 DB/前端服务），nightly 也未挂载。verify-frontend 的 BASE 固定 `http://localhost:15173`（vite dev），而 E2E/CI 链路由后端 SERVE_STATIC 托管生产构建（15001），该脚本历史上从未跑通过（audit 产物为 ERR_CONNECTION_REFUSED）。

其检查面均已存在更强替代：

- C-001 migrations → `check-migrations.mjs`（migration-check job）+ C-017 静态检查。
- C-002 RLS 跨租户隔离 → `rls-isolation.integration.test.ts`（testcontainers 真 PG，RUN_TESTCONTAINERS=1 在 CI 执行）。
- C-004 登录链接/导航 → `login.spec.ts`、`auth.setup.ts`（E2E nightly）。
- C-005 起始资金默认值 → `backtest.spec.ts` beforeEach 断言 `#bp-start-val` = 10000。
- C-006 CLS → `page-load-performance.spec.ts` 新增 P4 预算（chromium，nightly）。

## Decision

- 删除 `verify-backend.mjs` 与 `verify-frontend.mjs`，`run-all.mjs` 移除 `--skip-db/--skip-frontend` 参数与过滤逻辑，`ci.yml` 改 `pnpm verify:critical` 全量执行静态类脚本（verify-static/depcruise/infra/tests）。
- `_lib.mjs` 移除零消费者导出 `loadPg`/`withDb`（原仅供 verify-backend 使用）。
- 将 C-005、C-006 的断言迁移至既有 E2E spec（配套测试迁移而非删除）。

## Consequences

- (+) 消除 476 行从不执行的死脚本与其悬挂的 audit 产物。
- (+) verify:critical 语义简化：不再有"跳过 DB/前端"分支，CI 全量跑静态检查。
- (-) DB 状态类验证不再由独立脚本覆盖；RLS/迁移由集成测试与静态检查承担，若需部署后 DB 巡检应纳入部署流水线而非 CI 校验脚本。
