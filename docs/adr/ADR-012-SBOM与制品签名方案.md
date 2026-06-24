# ADR-012: SBOM与制品签名方案（syft + cosign）

## Status
Proposed

## Context
EO 14028（美国行政令）和EU CRA（欧盟网络弹性法案）要求软件供应链透明度，SBOM（Software Bill of Materials）是合规基础。未签名容器镜像可被替换为恶意镜像（供应链攻击），镜像完整性无法验证。

当前风险：
- Docker镜像无SBOM，无法快速响应依赖漏洞（如Log4j级别的事件）
- 容器镜像未签名，CI/CD流水线无法验证部署镜像的来源和完整性
- 无法满足SLSA（Supply-chain Levels for Software Artifacts）Level 2要求

候选方案：
- **syft**（SBOM）+ **cosign**（签名）：CNCF/Sigstore生态
- **trivy --sbom**（SBOM）+ **notation**（签名）：Aqua/Notary项目
- **syft** + **notation**：混合方案

## Decision
采用syft生成SBOM + cosign进行制品签名。

## Consequences
- (+) syft是CNCF项目，支持CycloneDX和SPDX双格式输出，满足不同合规要求
- (+) cosign是Sigstore项目，OCI镜像签名事实标准，支持keyless签名（Fulcio CA）
- (+) 两者均为单二进制，CI集成零成本，无需运行时环境
- (+) 满足SLSA Level 2要求（有构建来源证明+制品签名）
- (+) cosign支持Keyless模式（基于OIDC身份签名），无需管理长期密钥
- (+) syft支持多语言包检测（npm、Go modules、Python pip、Rust cargo），覆盖项目所有语言
- (-) 需管理cosign密钥对（若不使用Keyless模式），密钥轮换流程需文档化
- (-) 放弃trivy --sbom——SBOM格式单一（仅SPDX），且trivy核心定位是漏洞扫描而非SBOM生成
- (-) 放弃notation——生态不如cosign成熟，Keyless签名支持不完善，社区活跃度低
