const MAX_RANGE_SIZE = 100000;

export function numericRange(min: number, max: number, step: number, decimals = 2): number[] {
  if (step <= 0 || min > max) return [min];
  if (min === -Infinity || max === Infinity) {
    throw new RangeError('numericRange: min cannot be -Infinity, max cannot be Infinity');
  }
  if (!Number.isFinite(step) || step > max - min) return [min];
  if (min + step === min) {
    throw new RangeError('numericRange: step too small relative to min (floating-point stall)');
  }
  if ((max - min) / step > MAX_RANGE_SIZE) {
    throw new RangeError('numericRange: range too large');
  }
  const factor = 10 ** decimals;
  const arr: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    arr.push(Math.round(v * factor) / factor);
  }
  return arr;
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} 超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d.slice(0, 10);
}

export const DEFAULT_START_DATE = '2000-01-01';

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidDate(value: string): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
