import * as fc from 'fast-check';

export function check<A extends readonly unknown[]>(
  arbs: { [K in keyof A]: fc.Arbitrary<A[K]> },
  run: (...args: A) => unknown,
  numRuns?: number,
) {
  fc.assert(
    fc.property(...(arbs as fc.Arbitrary<unknown>[]), run as (...args: unknown[]) => unknown),
    numRuns === undefined ? undefined : { numRuns },
  );
}
