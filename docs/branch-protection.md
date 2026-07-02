# Branch Protection 建议（T-J1）

> 企业理由：main 分支无保护时，任何人可 force-push 或合并未通过 CI 的代码。

## GitHub Ruleset（推荐）

| 规则                            | 设置                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Require pull request            | 1+ approval                                                                       |
| Require status checks           | `Node.js`, `Go`, `Go Engine`, `Integration Tests`, `Docker Build & Security Scan` |
| Require conversation resolution | true                                                                              |
| Require linear history          | optional                                                                          |
| Block force pushes              | true                                                                              |
| Restrict deletions              | true                                                                              |

## Required Checks 清单

- Secret Scan (gitleaks)
- Node.js (check, lint, test:unit, coverage, build)
- Go / Go Engine (build, test -race, govulncheck)
- Integration Tests
- Migration Rollback Test
- Docker Build & Security Scan (Trivy)
- Contract Tests（本轮新增）

## CODEOWNERS（可选）

```
/docs/           @platform-team
/api/middleware/ @security-team
/migrations/     @dba-team
```
