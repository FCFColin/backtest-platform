# ADR-022: SLSA 出处证明与全量 SBOM 制品治理

> **企业理由**：软件供应链攻击（SolarWinds、xz-utils）使"产物是否由可信流水线构建、未被篡改"成为合规硬要求（US EO 14028、EU Cyber Resilience Act）。SBOM + Provenance 是供应链完整性的事实基础。

| 字段      | 值                                                      |
| --------- | ------------------------------------------------------- |
| 编号      | ADR-022                                                 |
| 状态      | 已接受                                                  |
| 日期      | 2026-06-25                                              |
| 决策者    | 安全/平台组                                             |
| 范围      | CI/CD 供应链                                            |
| 取代/修正 | 修正 ADR-012 与 CONTRIBUTING 中"已达 SLSA L2"的失实声明 |

## Context

审计（维度5 / 5.1-5.3）发现"文档与实现漂移"：

- `ADR-012`、`CONTRIBUTING.md:273` 声称满足 SLSA Level 2（含出处证明）。
- 但 `.github/workflows/ci.yml` **无任何 attestation/provenance 步骤**。
- SBOM 仅对 `backtest-api` 一个镜像生成，且未 `upload-artifact`（无法被下游消费）。
- cosign 签名为 key-based、条件开启、仅覆盖 2/4 镜像。

供应链合规的实质是"可验证"，而非"文档声称"。失实声明本身是合规风险（审计/认证时被判不通过）。

## Decision

1. **全量 SBOM**：对 4 个镜像（backtest-api、data-fetcher、engine-rs、engine-go）均生成 CycloneDX SBOM，并 `upload-artifact`（保留 30 天）供漏洞/license 工具消费。
2. **SLSA Provenance**：引入 `actions/attest-build-provenance@v1`，基于 GitHub OIDC + Sigstore keyless 为构建产物生成出处证明（无需托管私钥）。
3. **cosign keyless**：签名改为 keyless（OIDC 短期证书），消除私钥托管/轮换/泄露风险；待引入镜像仓库推送后覆盖全部 4 镜像。
4. **权限最小化**：docker job 显式声明 `id-token: write`、`attestations: write`、`contents: read`。

## Consequences

- 优势：消除文档/实现漂移；供应链可见性覆盖全栈；keyless 降低密钥运维负担；向 SLSA L3 演进路径清晰。
- 劣势：CI 增加约 1-2 分钟；attestation 依赖 GitHub OIDC（vendor 绑定）。
- 后续：镜像推送到 registry 后，将 Provenance 的 subject 由 SBOM 文件升级为镜像 digest，并对全部镜像启用 cosign。
- 工程权衡：当前 CI `load: true` 不推送镜像，故先对 SBOM 制品做 attestation，待推送链路就绪再按 digest 对镜像签名/证明。
