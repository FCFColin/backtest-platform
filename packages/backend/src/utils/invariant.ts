export function invariant(condition: boolean, message: string): asserts condition {
  if (process.env.NODE_ENV !== 'production' && !condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}
