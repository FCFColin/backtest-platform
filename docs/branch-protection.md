# Branch Protection 建议（T-J1）

> main 分支无保护时任何人可 force-push 或合并未通过 CI 的代码。

## GitHub Ruleset（推荐）

Require PR(1+ approval) · Require status checks · Require conversation resolution · Block force pushes · Restrict deletions · Require linear history(optional)

## Required Checks

Secret Scan(gitleaks) · Node.js(check, lint, test:unit, coverage, build) · Go/Go Engine(build, test -race, govulncheck) · Integration Tests · Migration Rollback Test · Docker Build & Security Scan(Trivy) · Contract Tests

## CODEOWNERS（可选）

```
/docs/           @platform-team
/api/middleware/ @security-team
/migrations/     @dba-team
```
