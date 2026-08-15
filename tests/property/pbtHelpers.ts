import * as fc from 'fast-check';

// 固定默认 seed 保证 CI 失败可复现；探索可传 FAST_CHECK_SEED 覆盖
fc.configureGlobal({ seed: Number(process.env.FAST_CHECK_SEED ?? 0x5eed) });

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
