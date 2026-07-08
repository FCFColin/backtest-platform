# Comprehensive Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement plan task-by-task.
>
> **Goal:** Complete all remaining cleanup: file-level, config hygiene, knip audit, Go/test file assessment, dependency audit
>
> **Architecture:** 6 independent phases ordered by risk (zero risk first). Each phase ends with build/lint/test verification.
>
> **Tech Stack:** TypeScript, Go, Vitest, ESLint, Knip

## Global Constraints

- Never change functionality — cleanup only
- Run `npm run check` after each phase
- Run `npm run lint` after each phase
- Run `npm run test:unit` after each phase

---

### Task 1: File-level Cleanup

**Files:**

- Delete: `.trae/documents/` (empty directory)
- Delete: `docs/inspections/archive/ARCHIVED.md`
- Modify: `.gitignore` (add `docs/inspections/archive/`)
- Stage: `Dockerfile`, `packages/backend/src/db/importBulk.ts`, `packages/backend/src/engine/portfolio.ts`
- Commit: all staged and working-tree deletions

- [ ] **Step 1: Delete empty .trae/documents/ directory**

```powershell
Remove-Item -LiteralPath ".trae/documents" -Force
```

- [ ] **Step 2: Delete archived inspection file**

```powershell
Remove-Item -LiteralPath "docs/inspections/archive/ARCHIVED.md" -Force
```

- [ ] **Step 3: Add archive dir to .gitignore**

Add line `docs/inspections/archive/` to `.gitignore` (after existing IDE lines).

- [ ] **Step 4: Stage working-tree deletions**

```powershell
git add Dockerfile
git add packages/backend/src/db/importBulk.ts
git add packages/backend/src/engine/portfolio.ts
```

- [ ] **Step 5: Commit all changes**

```powershell
git add .trae/documents docs/inspections/archive/ARCHIVED.md .gitignore
git commit -m "chore: file-level cleanup — delete empty dirs, archive, commit pending deletions"
```

- [ ] **Step 6: Verify**

```powershell
npm run check; if ($?) { npm run lint; if ($?) { npm run test:unit } }
```

---

### Task 2: Config Hygiene

**Files:**

- Modify: `.gitignore` (verify `docs/inspections/archive/` is properly added)

Already covered in Task 1.

- [ ] **Step 1: Verify .gitignore change is correct**

```powershell
Select-String -LiteralPath ".gitignore" -Pattern "docs/inspections/archive"
```

- [x] **Step 2: Keep vercel.json** (already confirmed)

---

### Task 3: Knip Dead Code Audit

**Files:**

- Modify: `package.json` (add knip devDependency)
- Create: `knip.json` (or use `knip` defaults)

- [ ] **Step 1: Install knip**

```powershell
pnpm add -D -w knip
```

- [ ] **Step 2: Run knip with default config**

```powershell
pnpm knip
```

- [ ] **Step 3: Review knip output, categorize findings**

  - False positives (barrel re-exports, intentional public API) → add to knip config `ignore`
  - Genuine dead code → delete or mark as `@public`

- [ ] **Step 4: Delete confirmed dead code files/exports**

- [ ] **Step 5: Verify build/tests still pass**

```powershell
npm run check; if ($?) { npm run lint; if ($?) { npm run test:unit } }
```

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml [deleted files]
git commit -m "chore: remove dead code identified by knip audit"
```

---

### Task 4: Go Engine Large File Assessment

**Files:**

- Assess: `engine-go/internal/montecarlo/montecarlo.go` (909 lines)
- Assess: `engine-go/internal/engine/backtest.go` (850 lines)

- [ ] **Step 1: Read montecarlo.go and assess structure**

```powershell
cd engine-go
go vet ./...
```

- [ ] **Step 2: If well-structured, document decision; if clear extraction points exist, split**

- [ ] **Step 3: Read backtest.go and assess structure**

- [ ] **Step 4: Verify Go builds**

- [ ] **Step 5: Commit (if any splits)**

---

### Task 5: Large Test File Assessment

**Files:**

- Assess: `tests/unit/routes/backtest-routes.test.ts` (1093 lines)
- Assess: `tests/unit/services/data-service.test.ts` (856 lines)
- Assess: `tests/unit/middleware/refresh-token.test.ts` (851 lines)

- [ ] **Step 1: Read each file, assess if splitting by endpoint/function makes sense**

- [ ] **Step 2: If splitting, create sub-files and update imports**

- [ ] **Step 3: Verify all tests pass**

```powershell
npm run test:unit
```

- [ ] **Step 4: Commit**

---

### Task 6: Dependency Audit

**Files:**

- Read: `packages/backend/package.json`
- Read: `packages/frontend/package.json`

- [ ] **Step 1: Use depcheck or manual review to find unused deps**

```powershell
pnpm exec depcheck --json
```

- [ ] **Step 2: Remove confirmed unused dependencies**

- [ ] **Step 3: Verify build/tests pass**

```powershell
npm run check; if ($?) { npm run test:unit }
```

- [ ] **Step 4: Commit**
