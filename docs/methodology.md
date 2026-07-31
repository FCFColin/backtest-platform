# 开发方法论

## 分支策略

main(protected, PR only) ← feature/* / fix/* / refactor/*。hotfix 从 main 创建, 合并后删除。

## Conventional Commits

`type(scope): description`；types: feat/fix/refactor/chore/docs/test；scopes: backend/frontend/engine/data/db/infra/ci。

## PR 流程

1. 分支 + 开发 + 本地测试 → 2. PR → CI(type-check/lint/test/security-scan) → 3. Review(≥1 approve) → 4. 合并 → 自动部署 staging → 5. 手动验证后标记发布

## 质量门控

覆盖率 lines/functions ≥80%, branches ≥70%；安全: pnpm audit(high)+govulncheck+gitleaks+Trivy；依赖方向: dependency-cruiser(ADR-047/052)；迁移: migration-rollback up/down/up。husky + lint-staged: eslint --fix + prettier --write。
