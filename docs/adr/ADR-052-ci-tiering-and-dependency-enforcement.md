# ADR-052: CI/CD 与供应链安全（CI 分层 + 依赖强制 + SBOM + cosign）

> **企业理由**：CI 全量并行导致 PR 等待时间过长，且无分层意味着深层问题在浅层问题之前就已运行，浪费资源。缺少依赖方向校验容易产生循环依赖。软件供应链攻击（SolarWinds、xz-utils）使"产物是否由可信流水线构建、未被篡改"成为合规硬要求（US EO 14028、EU CRA）。SBOM + Provenance 是供应链完整性的事实基础。

| 字段   | 值                                                             |
| ------ | -------------------------------------------------------------- |
| 编号   | ADR-052                                                        |
| 状态   | 已实施                                                         |
| 日期   | 2026-07-05                                                     |
| 决策者 | 架构组                                                         |
| 范围   | CI 编排、依赖管理、质量门禁、CI/CD 供应链                      |
| 合并   | 原 ADR-012（SBOM+SLSA+cosign）、ADR-022（SLSA 出处证明）已并入 |

## Decision

### 1. CI 分层（.github/workflows/ci.yml）

- required（快速反馈，~3min）：lint、prettier、TypeScript 类型检查（tsc --noEmit）、单元测试（vitest run --project unit）。必须通过，阻塞合并。
- optional（深度检查，~12min）：集成测试、契约测试、E2E 测试、属性测试、安全扫描。失败不阻塞合并，但标注失败。

### 2. 依赖方向强制（dependency-cruiser）

- api/ 模块允许依赖 shared/ 和 packages/，禁止反向
- packages/ 模块允许依赖 shared/，禁止依赖 api/
- engine-go/ 和 data-fetcher/ 禁止依赖任何 TypeScript 模块
- 禁止循环依赖（任何层级）
- 禁止 src/ 内部跨层反向引用（如 services/ 依赖 routes/）
- 依赖检查在 CI 中作为 required job 运行，违反即阻断

### 3. SBOM 生成（syft）

采用 syft 生成 CycloneDX 格式 SBOM，覆盖全部镜像（backtest-api、data-fetcher、engine-go），并 upload-artifact（保留 30 天）供漏洞/license 工具消费。

### 4. SLSA Provenance + cosign Keyless 签名

- 引入 actions/attest-build-provenance@v1，基于 GitHub OIDC + Sigstore keyless 为构建产物生成出处证明（无需托管私钥）
- cosign 签名改为 keyless（OIDC 短期证书），消除私钥托管/轮换/泄露风险。待引入镜像仓库推送后覆盖全部镜像
- docker job 显式声明 id-token: write、attestations: write、contents: read（权限最小化）
- 放弃 trivy --sbom（SBOM 格式单一，核心定位是漏洞扫描）、notation（生态不如 cosign 成熟，Keyless 支持不完善）

## Consequences

- (+) PR 开发者 ~3min 即可获得核心反馈，不需要等待全量 job
- (+) 依赖方向被机械性强制，架构约定不会被意外破坏
- (+) syft 是 CNCF 项目，支持 CycloneDX 和 SPDX 双格式；cosign 是 OCI 镜像签名事实标准
- (+) 全量 SBOM 覆盖 + Provenance 使供应链可见性覆盖全栈；Keyless 降低密钥运维负担
- (-) CI 配置复杂度增加（job 依赖、条件触发）；CI 增加约 1-2 分钟
- (-) dependency-cruiser 规则需随架构演进维护
- (-) attestation 依赖 GitHub OIDC（vendor 绑定）；当前 CI load: true 不推送镜像，先对 SBOM 制品做 attestation
- (-) cosign keyless 需 OIDC provider 配置（部分落地）
