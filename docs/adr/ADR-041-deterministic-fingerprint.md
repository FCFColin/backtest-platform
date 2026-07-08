# ADR-041: 确定性指纹

> **企业理由**：多语言（Go + TypeScript）和跨平台（开发机 Linux/Windows/Mac vs CI Linux vs 生产 Linux）环境中，浮点运算（尤其是 Go vs JavaScript IEEE 754 实现差异）可能导致相同输入产生微小但累积的结果偏差。当前没有任何机制检测这种不一致性。

| 字段   | 值                                                |
| ------ | ------------------------------------------------- |
| 状态   | 已实施                                            |
| 日期   | 2026-07-05                                        |
| 决策者 | 架构组                                            |
| 范围   | Go 引擎、CI 流水线、平台一致性                    |
| 关联   | ADR-031（单引擎 fail-closed）、ADR-038（CI 分层） |

## Decision（决策内容）

### 指纹生成（Go 引擎）

在每个回测/优化/蒙特卡洛计算完成后，Go 引擎计算输出的 SHA-256 指纹：

1. 将所有数值结果（权重、收益率、波动率、夏普比等）按固定 schema 序列化为 JSON
2. 对序列化字节计算 SHA-256 哈希
3. 在响应中包含 `x-result-fingerprint` 响应头

指纹参与计算：`SHA256(JSON(canonicalSortKeys(result)))`，其中 `canonicalSortKeys` 确保 key 顺序稳定。

### CI 交叉编译指纹比对

CI 中为同一组标准输入分别编译并运行 engine-go 的 linux/amd64 和 linux/arm64 二进制：

1. 使用固定的测试用例数据集（`engine-go/testdata/fingerprint-fixtures/`）
2. 两个二进制分别产生指纹，比对是否一致
3. 指纹不一致 → CI job 失败，标记为跨平台不一致性

### Node-canonical 比对

对 `api/engine/`（Node-canonical 计算，见 ADR-008），使用相同方法在 CI 中比对 Node.js 不同版本（当前 LTS vs 最新 LTS）的输出指纹。

## Consequences（后果）

### 正面

- 任意架构不一致性在 CI 被捕获，不会流入生产
- 指纹可附加到响应中供客户端/监控校验结果一致性
- 发现浮点差异后可针对性地调整算法（如使用 `math/big` 定点数或增加容忍度）

### 负面

- Canonical JSON 序列化方案需要跨语言一致实现（Go `sort.Slice` + `json.Marshal` vs JavaScript 的 key 排序）
- 增加 CI 构建时间（两架构交叉编译 + 运行）
- 指纹本身可能因浮点舍入在不同平台上略有差异（这正是要检测的），需要设定容忍阈值而非字节精确匹配
