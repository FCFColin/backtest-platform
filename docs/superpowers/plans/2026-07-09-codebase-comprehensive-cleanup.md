> **[已取代]** 本文档已被 `.trae/specs/codebase-cleanup/` 下的新 spec 取代（2026-07-10）。新 spec 基于实际诊断结果，修正了本文档中与现状不符的数据。

# Codebase Comprehensive Cleanup Implementation Plan

> **For agentic workers:** Execute tasks sequentially per batch. Each batch ends with verification. All files must be ≤250 lines after splitting/merging.

**Goal:** Clean up, delete, merge, split, simplify, and optimize the entire codebase across all domains.

**Architecture:** 10 serial batches, each independently verifiable. Batch 1 (dead code) → 2-4 (merge small files) → 5-8 (split large files) → 9 (config consolidation) → 10 (docs).

**Tech Stack:** TypeScript (ESM), Go, Vitest, React 18, Express 4, K8s YAML

## Global Constraints

- Every source file must be ≤250 lines after processing (exceptions: data files, lock files, generated configs)
- All existing imports must be updated when files move/merge
- No public API changes — exports must keep same names
- ESM imports use `.js` extension in relative paths
- After each batch: `pnpm check && pnpm lint --fix && pnpm test`

---
