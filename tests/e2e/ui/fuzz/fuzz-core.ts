export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  pickMany: <T>(arr: readonly T[], n: number) => T[];
  bool: () => boolean;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    pickMany: (arr, n) => {
      const pool = [...arr];
      const out: typeof arr = [];
      for (let i = 0; i < n && pool.length > 0; i++) {
        out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      }
      return out;
    },
    bool: () => next() < 0.5,
  };
}

export function getSeed(): number {
  const fromEnv = Number(process.env.FUZZ_SEED);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 20260802;
}

const TICKER_POOL = [
  'VTI',
  'BND',
  'SPY',
  'QQQ',
  'GLD',
  'TLT',
  'AGG',
  'VXUS',
  'MUB',
  'BNDX',
  'IWM',
  'EFA',
  'LQD',
  'HYG',
  'DIA',
  'XLK',
  'TIP',
  'SHY',
  'IEF',
  'XLV',
] as const;

export function randomPortfolio(rng: Rng): { tickers: string[]; weights: number[] } {
  const count = rng.int(2, 4);
  const tickers = rng.pickMany(TICKER_POOL, count);
  let remaining = 100;
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    const left = count - i - 1;
    const max = remaining - left * 10;
    const w = i === count - 1 ? remaining : (rng.int(10, Math.max(10, max)) / 10) * 10;
    weights.push(Math.round(w / 10) * 10);
    remaining -= weights[i];
  }
  weights[count - 1] += remaining;
  return { tickers, weights };
}

export function randomDateRange(rng: Rng): { start: string; end: string } {
  const startYear = rng.int(2010, 2020);
  const endYear = Math.min(startYear + rng.int(2, 10), 2025);
  return {
    start: `${startYear}-01-01`,
    end: `${endYear}-12-31`,
  };
}

export function randomAmount(rng: Rng, min: number, max: number, step = 1000): number {
  const steps = Math.floor((max - min) / step);
  return min + rng.int(0, steps) * step;
}
