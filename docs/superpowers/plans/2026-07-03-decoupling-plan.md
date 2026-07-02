# 代码库去耦合 Implementation Plan

> **For agentic workers:** 5 sequential phases (S1→S5), each independently deliverable and testable.

**Goal:** Decouple the monorepo into cleanly separated packages with independent build, test, and deployment.

**Architecture:** Single npm monorepo → pnpm workspace with 3 packages (frontend/backend/shared) + 2 Go services (unchanged). Shared types published as `@backtest/shared` internal package.

**Tech Stack:** pnpm workspaces, TypeScript project references (optional), Vite, Vitest

## Global Constraints

- Every phase must be independently testable and reversible
- Shared types remain TypeScript-only (no runtime logic)
- All existing tests must pass after each phase
- Go services are out of scope for this plan
- E2E tests stay in root-level directory

---

### S1: shared/ 包化 + @backtest/shared 导入改造

**Files:**

- Create: `shared/package.json`
- Modify: `shared/types/index.ts` (add explicit exports if needed)
- Verify: all imports from `../../shared/types` and `../../shared/constants` still work

**Steps:**

- [ ] Create `shared/package.json` with `{ "name": "@backtest/shared", "type": "module", "private": true, "exports": { "./*": "./*" } }`
- [ ] Verify `tsc --noEmit` still passes (shared is already in tsconfig include)
- [ ] Verify `npm run test:unit` still passes
- [ ] Run `npm run check` to confirm no regression

---

### S2: tsconfig 三拆分 + 构建解耦

**Files:**

- Create: `tsconfig.base.json`, `tsconfig.frontend.json`, `tsconfig.backend.json`, `tsconfig.shared.json`
- Modify: `tsconfig.json` (point to frontend config), `package.json` (scripts)
- Verify: tsc passes independently for frontend and backend

**Steps:**

- [ ] Split tsconfig into base/frontend/backend/shared
- [ ] Update package.json scripts (check:frontend, check:backend, check)
- [ ] Verify frontend tsc: `tsc -p tsconfig.frontend.json --noEmit`
- [ ] Verify backend tsc: `tsc -p tsconfig.backend.json --noEmit`
- [ ] Verify `npm run test:unit` passes

---

### S3: pnpm workspaces 迁移

**Files:**

- Create: `pnpm-workspace.yaml`, `packages/frontend/package.json`, `packages/backend/package.json`, `packages/shared/package.json`
- Move: `src/` → `packages/frontend/src/`, `api/` → `packages/backend/src/`, `shared/` → `packages/shared/`
- Modify: Root `package.json` (scripts), all import paths
- Delete: old `src/`, `api/`, `shared/` after move

**Steps:**

- [ ] Create `pnpm-workspace.yaml`
- [ ] Create `packages/shared/package.json`
- [ ] Create `packages/frontend/package.json` with only frontend deps
- [ ] Create `packages/backend/package.json` with only backend deps
- [ ] Move files to packages/ structure
- [ ] Update all import paths
- [ ] Update Vite/Vitest/TSC configs for new paths
- [ ] `pnpm install` and verify builds
- [ ] Run all tests

---

### S4: 测试 co-locate + vitest 拆分

**Files:**

- Move: `tests/unit/*` → co-locate with source
- Create: `packages/frontend/vitest.config.ts`, `packages/backend/vitest.config.ts`
- Modify: Root `vitest.config.ts` (reduce scope)

**Steps:**

- [ ] Move frontend tests alongside source files
- [ ] Move backend tests alongside source files
- [ ] Create per-package vitest configs
- [ ] Update test imports
- [ ] Verify `pnpm --filter @backtest/frontend test` passes
- [ ] Verify `pnpm --filter @backtest/backend test` passes

---

### S5: Docker 双镜像 + CI 拆分

**Files:**

- Create: `Dockerfile.frontend`, `Dockerfile.backend`
- Modify: `docker-compose.yml`, `.github/workflows/` (if exists)

**Steps:**

- [ ] Create Dockerfile.frontend (static build)
- [ ] Create Dockerfile.backend (API build)
- [ ] Update docker-compose for dual services
- [ ] Update CI pipelines
- [ ] Verify docker-compose up works
