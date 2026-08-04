import { it, expect } from 'vitest';

export type Mutator = (d: Record<string, unknown>) => void;

const path = (d: Record<string, unknown>, key: string) => {
  const ks = key.split('.');
  let cur: Record<string, unknown> = d;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] as Record<string, unknown>;
  return [cur, ks.at(-1)!] as const;
};

export const set =
  (key: string, val: unknown): Mutator =>
  (d) => {
    const [cur, k] = path(d, key);
    cur[k] = val;
  };

export const del =
  (key: string): Mutator =>
  (d) => {
    const [cur, k] = path(d, key);
    delete cur[k];
  };

type ZodLike = { parse: (d: unknown) => unknown };

export function mutSuite(
  schema: ZodLike,
  make: () => Record<string, unknown>,
  invalid: Array<[string, Mutator]>,
  valid: Array<[string, Mutator]> = [],
) {
  it('合法输入应通过校验', () => {
    expect(() => schema.parse(make())).not.toThrow();
  });
  it.each<[string, Mutator]>(invalid)('%s 应抛错', (_n, mutate) => {
    const d = make();
    mutate(d);
    expect(() => schema.parse(d)).toThrow();
  });
  it.each<[string, Mutator]>(valid)('%s 应通过校验', (_n, mutate) => {
    const d = make();
    mutate(d);
    expect(() => schema.parse(d)).not.toThrow();
  });
}
