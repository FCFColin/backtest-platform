import type { PortfolioResult } from '@backtest/shared';

export function mergePortfolioSeries<T, P extends Pick<PortfolioResult, 'name'>>(
  portfolios: P[],
  getSeries: (p: P) => T[] | undefined,
  getKey: (item: T) => string | number,
  getValue: (item: T) => number,
  keyName: 'date' | 'year' = 'date',
): Record<string, string | number>[] {
  if (portfolios.length === 0) return [];
  const map = new Map<string | number, Record<string, string | number>>();
  for (const p of portfolios) {
    for (const item of getSeries(p) ?? []) {
      const key = getKey(item);
      if (!map.has(key)) {
        map.set(key, { [keyName]: key });
      }
      map.get(key)![p.name] = getValue(item);
    }
  }
  const entries = Array.from(map.entries());
  entries.sort((a, b) =>
    typeof a[0] === 'number'
      ? (a[0] as number) - (b[0] as number)
      : String(a[0]).localeCompare(String(b[0])),
  );
  return entries.map(([, value]) => value);
}
