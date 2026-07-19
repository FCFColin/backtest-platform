/**
 * @file Shared statistical utility functions
 */

/**
 * Compute the p-th percentile of an array.
 * @param arr - Input numbers
 * @param p - Percentile in [0, 1]
 * @returns The percentile value, or 0 for empty arrays
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

/**
 * Compute the arithmetic mean of an array.
 * @param arr - Input numbers
 * @returns The mean, or 0 for empty arrays
 */
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Compute the sample standard deviation (n-1 denominator).
 * @param arr - Input numbers
 * @returns The standard deviation, or 0 for arrays with fewer than 2 elements
 */
export function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}
