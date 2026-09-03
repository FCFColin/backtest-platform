import { useState } from 'react';
type Dict = Record<string, unknown>;
type AW = { ticker: string; weight: number | string };
export type SetterState<T> = T & {
  [K in keyof T as `set${Capitalize<string & K>}`]: (v: T[K]) => void;
};
export function useSetterState<T extends Dict>(initial: T): SetterState<T> {
  const [state, setState] = useState(initial);
  const mk = (k: string) => (v: unknown) => setState((p) => ({ ...p, [k]: v }));
  return {
    ...state,
    ...Object.fromEntries(
      Object.keys(initial).map((k) => [`set${k[0].toUpperCase()}${k.slice(1)}`, mk(k)]),
    ),
  } as SetterState<T>;
}
export function useAssetList<T extends AW>(d: T[], f: () => T, n = 1) {
  const [items, setItems] = useState<T[]>(() => d);
  return {
    assets: items,
    setAssets: setItems,
    addAsset: () => setItems((p) => [...p, f()]),
    removeAsset: (i: number) => setItems((p) => (p.length > n ? p.filter((_, j) => j !== i) : p)),
    updateAsset: (i: number, k: keyof T, v: T[keyof T]) =>
      setItems((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x))),
    totalWeight: items.reduce((s, a) => s + (Number(a.weight) || 0), 0),
  };
}
