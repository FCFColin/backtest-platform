/**
 * 断言条件为真，否则抛出 Invariant violation 错误
 *
 * 仅在非 production 环境下检查；production 环境下静默跳过，
 * 用于开发期捕获不变式违例而不影响线上稳定性。
 * @param condition - 待断言的条件
 * @param message - 违例时的错误描述
 * @returns 无返回值（TypeScript assertion function，断言 condition 为真）
 * @throws {Error} 当 condition 为 false 且 NODE_ENV !== 'production' 时抛出
 */
export function invariant(condition: boolean, message: string): asserts condition {
  if (process.env.NODE_ENV !== 'production' && !condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}
