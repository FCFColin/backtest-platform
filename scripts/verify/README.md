# CRITICAL 修复验证脚本目录

> 每个修复必须有对应的自动化验证脚本。没有验证脚本的修复视为未完成。

## 用途

对 [`docs/audit/2026-07-28/CRITICAL-FIXES.md`](../../docs/audit/2026-07-28/CRITICAL-FIXES.md) 中智能体 A 声称修复的 21 项 CRITICAL，以及智能体 B 独立发现的问题，做**独立的真实性核查**。

不信任"DONE"标记。每一项都由独立验证脚本跑一遍，输出 `docs/audit/2026-07-28/verify/{issue-id}-reverify.json`。

## 判定规则

| 状态 | 含义 | 后续动作 |
|------|------|----------|
| `PASS` | 验证脚本通过 + 人工截图确认 | 进入 VERIFIED_FIXED |
| `FAIL` | 验证脚本明确失败 | 进入 P1 重修 |
| `SKIP` | 依赖不可用（Docker 未起、API 未运行） | 解决依赖后重跑 |
| `NEEDS_MANUAL_REVIEW` | 验证脚本 PASS 但截图存疑 | 人工复查 |

## 文件结构

```
scripts/verify/
├── _lib.mjs                # 共享工具：DB 连接、跨平台 grep、结果输出
├── run-all.mjs             # 聚合执行所有 C-*.mjs 脚本
├── README.md               # 本文件
├── C-001-migration-chain.mjs   # 迁移链完整性
├── C-002-rls-isolation.mjs     # RLS 多租户隔离
├── C-003-webhook-ssrf.mjs      # Webhook SSRF 防护
├── C-004-005-006-019-frontend.mjs  # 前端路由/默认值/CLS/死代码（chrome-devtools）
├── C-007-k8s-overlays.mjs
├── C-008-readiness-probe.mjs
├── C-009-network-policy.mjs
├── C-010-metrics.mjs
├── C-011-hpa.mjs
├── C-012-unit-tests.mjs
├── C-013-coverage-gate.mjs
├── C-014-go-coverage.mjs
├── C-015-adr-index.mjs
├── C-016-changelog.mjs
├── C-018-singleflight.mjs
├── C-020-engine-timeout.mjs
├── C-021-bullmq-dlq.mjs
├── C-022-openapi-url.mjs
├── C-023-adr-031-degraded.mjs
├── C-024-webhook-encryption.mjs
└── C-025-trivy.mjs
```

## 运行方式

```bash
# 跑所有验证
pnpm verify:critical

# 只跑指定 issue
node scripts/verify/run-all.mjs --only=C-001

# 跳过前端验证（无 dev server 时）
node scripts/verify/run-all.mjs --skip-frontend

# 跳过 DB 验证（无 postgres 时）
node scripts/verify/run-all.mjs --skip-db
```

## 输出

- 每个验证脚本输出 `docs/audit/2026-07-28/verify/{issue-id}-reverify.json`
- 前端验证脚本输出截图到 `docs/audit/2026-07-28/verify/screenshots/`
- `run-all.mjs` 聚合输出 `docs/audit/2026-07-28/verify/SUMMARY.md`
- 主线程基于以上产出 `docs/audit/2026-07-28/verify/REALITY-CHECK.md`

## CI 集成

每个验证脚本必须进 CI（`.github/workflows/ci.yml`）：

```yaml
- name: Run critical fixes verification
  run: pnpm verify:critical
```

任何 CRITICAL 回归 → CI 红灯，阻止合并。
