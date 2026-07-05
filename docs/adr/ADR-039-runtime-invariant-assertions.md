# ADR-039: 运行时不变量断言

> **企业理由**：回测与优化等关键计算路径中存在必须始终成立的不变量（如权重之和为 1、波动率为正、资产数量 > 0），但这些约束在生产中无校验，错误可能静默传播到最终结果。需要一种开发时可发现、生产零开销的断言机制。

| 字段   | 值                                                                        |
| ------ | ------------------------------------------------------------------------- |
| 状态   | 已实施                                                                    |
| 日期   | 2026-07-05                                                                |
| 决策者 | 架构组                                                                    |
| 范围   | domain 层、计算逻辑、测试                                                  |
| 关联   | ADR-013（领域模型）、ADR-021（复杂度量化门控）                             |

## Decision（决策内容）

### `invariant()` 函数（`shared/utils/invariant.ts`）

在 domain 层核心函数入口和关键变点（如权重分配后、优化器输出前）插入断言：

```typescript
export function invariant(condition: boolean, message: string): asserts condition {
  if (process.env.NODE_ENV !== 'production' && !condition) {
    throw new Error(`Invariant failed: ${message}`);
  }
}
```

使用示例：

```typescript
function rebalance(weights: number[]): number[] {
  invariant(weights.length > 0, 'weights must not be empty');
  const sum = weights.reduce((a, b) => a + b, 0);
  invariant(Math.abs(sum - 1) < 1e-10, `weights must sum to 1, got ${sum}`);
  // ...
}
```

### 作用域规则

- 仅在 domain 层（`api/domain/`、`shared/domain/`、`engine-go/`）使用
- 不在 route、controller、service 等 orchestration 层使用（这些层应使用 Zod 验证输入而非断言）
- 断言表达的是"这个函数内部/其调用者的实现假设"，不是用户输入验证

### 构建时消除

通过 TypeScript 自定义 transformer 或 esbuild plugin，在 production build 中移除 `invariant` 调用。当前阶段由 `process.env.NODE_ENV` 运行时守卫实现。

## Consequences（后果）

### 正面

- 开发/test 阶段不变量违规立即抛出明确错误而非静默传播
- 错误信息包含上下文（变量实际值），调试效率提升
- production 构建零开销（生产移除）

### 负面

- 需要维护 `NODE_ENV` 环境变量正确设置（test/development vs production）
- 断言不能替代用户输入验证（Zod 仍然是第一道防线）
- 需要 code review 确保断言表达的是真正的不变量而非可恢复的业务逻辑
