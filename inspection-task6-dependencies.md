# Dependency & Supply Chain Inspection Report

**Date:** 2026-07-03
**Scope:** Node.js (pnpm workspace: 3 packages), Go (2 modules), Docker (6 Dockerfiles), SBOM/signing scripts

---

## 1. Node.js Dependencies

Workspace: monorepo with 3 packages (`@backtest/shared`, `@backtest/backend`, `@backtest/frontend`) + root.

### Root `package.json`

| Metric            | Count |
| ----------------- | ----- |
| `dependencies`    | 0     |
| `devDependencies` | 22    |
| License           | MIT   |

### `@backtest/backend`

| Metric            | Count |
| ----------------- | ----- |
| `dependencies`    | 28    |
| `devDependencies` | 10    |

### `@backtest/frontend`

| Metric            | Count |
| ----------------- | ----- |
| `dependencies`    | 12    |
| `devDependencies` | 20    |

### `@backtest/shared`

| Metric            | Count          |
| ----------------- | -------------- |
| `dependencies`    | 0              |
| `devDependencies` | 1 (typescript) |

### Total across workspace (unique if deduplicated across packages)

- Runtime dependencies: ~40
- Dev dependencies: ~53
- Workspace references: `@backtest/shared` referenced by backend + frontend

### Audit

`pnpm audit --audit-level=high --prod` → **No known vulnerabilities found.** No high/critical advisories in production dependencies.

---

## 2. Go Module Versions

| Module                | Go Version    |
| --------------------- | ------------- |
| `engine-go/go.mod`    | **go 1.26.0** |
| `data-fetcher/go.mod` | **go 1.26.4** |

**Consistency:** ❌ **Minor mismatch.** engine-go uses 1.26.0, data-fetcher uses 1.26.4. Both are in the Go 1.26 line so they are interoperable, but they should ideally be aligned to the same patch level for CI consistency.

Notable: `engine-go/Dockerfile` uses `golang:1.25-alpine` (no digest pin) — this is **behind** the go.mod version (1.26.0). The builder image is one minor version older than what the module declares.

---

## 3. Docker Digest Pinning

| Dockerfile                | Stage   | Base Image                                    | Digest-Pinned?                  |
| ------------------------- | ------- | --------------------------------------------- | ------------------------------- |
| `Dockerfile`              | builder | `node:20-alpine@sha256:...`                   | ✅ Yes                          |
| `Dockerfile`              | runner  | `node:20-alpine@sha256:...`                   | ✅ Yes                          |
| `Dockerfile.backend`      | builder | `node:20-alpine@sha256:...`                   | ✅ Yes                          |
| `Dockerfile.backend`      | runner  | `node:20-alpine@sha256:...`                   | ✅ Yes                          |
| `Dockerfile.frontend`     | builder | `node:20-alpine@sha256:...`                   | ✅ Yes                          |
| `Dockerfile.frontend`     | runner  | `nginx:stable-alpine@sha256:...`              | ✅ Yes                          |
| `Dockerfile.distroless`   | builder | `node:20-alpine@sha256:...`                   | ✅ Yes                          |
| `Dockerfile.distroless`   | runner  | `gcr.io/distroless/nodejs20-debian12:nonroot` | ❌ **No** (tag only, no digest) |
| `engine-go/Dockerfile`    | builder | `golang:1.25-alpine`                          | ❌ **No** (tag only, no digest) |
| `engine-go/Dockerfile`    | runner  | `alpine:3.20@sha256:...`                      | ✅ Yes                          |
| `data-fetcher/Dockerfile` | builder | `golang:1.22-alpine@sha256:...`               | ✅ Yes                          |
| `data-fetcher/Dockerfile` | runner  | `alpine:3.20@sha256:...`                      | ✅ Yes                          |

**Summary: 2 of 12 stages are NOT digest-pinned** — risk of tag-poisoning supply-chain attacks:

1. `Dockerfile.distroless` runner stage — uses `gcr.io/distroless/nodejs20-debian12:nonroot` (floating tag)
2. `engine-go/Dockerfile` builder stage — uses `golang:1.25-alpine` (floating tag, also version mismatch with go.mod)

---

## 4. SBOM & Signing Tooling

### `scripts/generate-sbom.sh`

- **Tool:** `syft` (Anchore)
- **Output format:** CycloneDX JSON
- **Usage:** `./generate-sbom.sh <image-name> <tag>`
- **Status:** ✅ Ready for CI integration. Requires `syft` CLI to be installed.
- Referenced by ADR-012.

### `scripts/sign-image.sh`

- **Tool:** `cosign` (Sigstore)
- **Key source:** `COSIGN_PRIVATE_KEY` environment variable
- **Usage:** `./scripts/sign-image.sh <image-name> <tag>`
- **Status:** ✅ Ready for CI integration. Requires `cosign` CLI + private key configured.
- Referenced by ADR-012.

**Issue:** Both scripts are present but there is no evidence they are wired into CI/CD pipelines (no `.github/workflows/` or CI config checked — out of scope). They exist as standalone scripts only.

---

## 5. Unused / Unlisted Dependencies (Knip Analysis)

Knip reported the following categories of issues:

| Category                   | Count | Highlights                                                                                                                                                                                                                                                                             |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unused files**           | 15    | Includes `postcss.config.js`, `tailwind.config.js`, several `scripts/*`, benchmark file, dead store/hooks files                                                                                                                                                                        |
| **Unused dependencies**    | 1     | `zod` in `packages/frontend/package.json` — listed but Knip couldn't find direct imports                                                                                                                                                                                               |
| **Unused devDependencies** | 16    | Almost all frontend devDeps (`@eslint/js`, `@testing-library/react`, `autoprefixer`, `postcss`, `tailwindcss`, ESLint plugins, Vite plugins) — likely false positives from config-based usage; `tsx` in backend devDeps also flagged                                                   |
| **Unlisted dependencies**  | 51    | `@backtest/shared`, `pg`, `express`, `jose`, `bullmq`, `zod`, `@testing-library/react`, `happy-dom`, `vite`, etc. used in test files without being listed in the package's own `package.json` (they exist in other workspace packages or root — workspace resolution works at runtime) |
| **Unused exports**         | 80    | Many component-level exports (AnalysisCharts sub-components, utility functions, types) not used outside their defining modules                                                                                                                                                         |
| **Unused exported types**  | 87    | TypeScript types/interfaces exported but not imported elsewhere                                                                                                                                                                                                                        |
| **Duplicate exports**      | 1     | `makeLinearPriceData` / `makePriceData` in `tests/helpers/fixtures.ts`                                                                                                                                                                                                                 |

**Key action items from Knip:**

- `zod` in frontend is unused at the import level (likely transitive via `@backtest/shared` or schema validation patterns)
- 16 devDependencies flagged as unused — most are config-visible (eslint, vite plugins, postcss) rather than code-imported; these are likely **false positives** from Knip's static analysis not tracing config file references
- 51 unlisted dependencies in test files suggests no `knip.config` is ignoring the test directory — most are workspace-private packages (`@backtest/shared`) used in co-located tests
- The high number of unused exports/types (167 total) indicates opportunity for cleanup but no security risk

---

## 6. Overall Assessment

| Area                              | Rating         | Notes                                                                                                       |
| --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| Node.js vulnerability posture     | 🟢 **Good**    | Zero high/critical advisories                                                                               |
| Go version consistency            | 🟡 **Minor**   | 1.26.0 vs 1.26.4; builder image (1.25) behind go.mod (1.26)                                                 |
| Docker digest pinning             | 🟡 **Partial** | 10/12 stages pinned; `Dockerfile.distroless` runner + `engine-go/Dockerfile` builder are floating tags      |
| SBOM generation                   | 🟢 **Ready**   | syft + CycloneDX script present                                                                             |
| Image signing                     | 🟢 **Ready**   | cosign + Sigstore script present                                                                            |
| CI/CD integration of SBOM/signing | 🟡 **Unknown** | Scripts exist but no evidence of pipeline wiring                                                            |
| Unused/unlisted deps              | 🟡 **Noise**   | Mostly false positives from test files and config-file usage; 1 real unused runtime dep (`zod` in frontend) |

### Recommendations (non-blocking)

1. Pin `golang:1.25-alpine` to a digest in `engine-go/Dockerfile` AND upgrade to `golang:1.26-alpine` to match go.mod
2. Pin `gcr.io/distroless/nodejs20-debian12:nonroot` to a digest in `Dockerfile.distroless`
3. Remove `zod` from frontend `package.json` if unused, or add a Knip config to suppress false positives
4. Add Knip config (`knip.json`) to ignore test files and config-file-referenced devDependencies
5. Wire SBOM/signing scripts into CI pipeline (GitHub Actions or equivalent)
