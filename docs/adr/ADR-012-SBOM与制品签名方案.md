# ADR-012: 供应链安全 — SBOM + SLSA Provenance + cosign Keyless 签名

> **企业理由**：软件供应链攻击（SolarWinds、xz-utils）使"产物是否由可信流水线构建、未被篡改"成为合规硬要求（US EO 14028、EU Cyber Resilience Act）。SBOM + Provenance 是供应链完整性的事实基础。

| 字段   | 值                                                    |
| ------ | ----------------------------------------------------- |
| 编号   | ADR-012                                               |
| 状态   | 已接受                                                |
| 日期   | 2026-06-24（初始）；2026-06-25 修正（合并原 ADR-022） |
| 决策者 | 安全/平台组                                           |
| 范围   | CI/CD 供应链                                          |
| 合并   | 原 ADR-022（SLSA 出处证明与全量 SBOM 制品治理）已并入 |

## Context

EO 14028 和 EU CRA 要求软件供应链透明度，SBOM 是合规基础。未签名容器镜像可被替换为恶意镜像（供应链攻击），镜像完整性无法验证。

初始决策（ADR-012）采用 syft + cosign，但后续审计发现文档与实现漂移：

- 声称满足 SLSA Level 2（含出处证明），但 CI 无任何 attestation/provenance 步骤。
- SBOM 仅对一个镜像生成，且未 `upload-artifact`（无法被下游消费）。
- cosign 签名为 key-based、条件开启、仅覆盖部分镜像。

供应链合规的实质是"可验证"，而非"文档声称"。失实声明本身是合规风险。

候选方案：

- **syft**（SBOM）+ **cosign**（签名）：CNCF/Sigstore 生态
- **trivy --sbom**（SBOM）+ **notation**（签名）：Aqua/Notary 项目
- **syft** + **notation**：混合方案

## Decision

### 1. SBOM 生成（syft）

采用 syft 生成 CycloneDX 格式 SBOM，覆盖全部镜像（backtest-api、data-fetcher、engine-go），并 `upload-artifact`（保留 30 天）供漏洞/license 工具消费。

### 2. SLSA Provenance

引入 `actions/attest-build-provenance@v1`，基于 GitHub OIDC + Sigstore keyless 为构建产物生成出处证明（无需托管私钥）。

### 3. cosign Keyless 签名

签名改为 keyless（OIDC 短期证书），消除私钥托管/轮换/泄露风险。待引入镜像仓库推送后覆盖全部镜像。

### 4. 权限最小化

docker job 显式声明 `id-token: write`、`attestations: write`、`contents: read`。

## Consequences

- (+) syft 是 CNCF 项目，支持 CycloneDX 和 SPDX 双格式输出，满足不同合规要求
- (+) cosign 是 Sigstore 项目，OCI 镜像签名事实标准，Keyless 模式无需管理长期密钥
- (+) 两者均为单二进制，CI 集成零成本，无需运行时环境
- (+) 全量 SBOM 覆盖 + Provenance 使供应链可见性覆盖全栈
- (+) Keyless 降低密钥运维负担，向 SLSA L3 演进路径清晰
- (-) CI 增加约 1-2 分钟；attestation 依赖 GitHub OIDC（vendor 绑定）
- (-) 放弃 trivy --sbom — SBOM 格式单一（仅 SPDX），核心定位是漏洞扫描而非 SBOM 生成
- (-) 放弃 notation — 生态不如 cosign 成熟，Keyless 签名支持不完善
- (-) 当前 CI `load: true` 不推送镜像，先对 SBOM 制品做 attestation；待推送链路就绪再按 digest 对镜像签名/证明
