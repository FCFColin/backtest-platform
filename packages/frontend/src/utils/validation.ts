export function validateAssetWeights(assets: { weight?: number }[]): string | null {
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return `Weights must sum to 100%, got ${totalWeight.toFixed(2)}%`;
  }
  return null;
}

/** Portfolio validation failure category, used by {@link validatePortfolioCore}. */
type PortfolioValidationKey = 'emptyTicker' | 'weightMismatch';

/** Minimal portfolio shape required by {@link validatePortfolioCore}. */
interface PortfolioLike {
  assets: { ticker: string; weight: number }[];
}

/** Options for {@link validatePortfolioCore}. */
interface PortfolioValidationOptions {
  /** Number of leading portfolios to validate. Defaults to all. */
  limit?: number;
  /**
   * Empty-ticker check mode:
   * - 'strict' (default): error if any asset has an empty ticker
   * - 'lenient': error only when no asset has a non-empty ticker
   */
  emptyTickerMode?: 'strict' | 'lenient';
  /**
   * Predicate returning true when portfolio at idx has a valid weight sum.
   * When omitted, the weight check is skipped.
   */
  isWeightComplete?: (idx: number) => boolean;
  /**
   * Iteration strategy:
   * - 'single-pass' (default): each portfolio is fully validated before moving on
   * - 'two-pass': all portfolios are checked for empty tickers first, then for weights
   */
  passStrategy?: 'single-pass' | 'two-pass';
  /** Produces a localized error message for the first failing portfolio. */
  onError: (idx: number, key: PortfolioValidationKey, totalWeight: number) => string;
}

type PortfolioCheck<P> = (p: P, idx: number) => PortfolioValidationKey | null;

function hasTickerIssue(p: PortfolioLike, mode: 'strict' | 'lenient'): boolean {
  if (mode === 'strict') {
    return p.assets.some((a) => !a.ticker.trim());
  }
  return p.assets.filter((a) => a.ticker.trim() !== '').length === 0;
}

function hasWeightIssue(idx: number, isWeightComplete?: (idx: number) => boolean): boolean {
  return isWeightComplete ? !isWeightComplete(idx) : false;
}

function totalWeightOf(p: PortfolioLike): number {
  return p.assets.reduce((s, a) => s + a.weight, 0);
}

function findFirstFailure<P extends PortfolioLike>(
  portfolios: P[],
  limit: number,
  check: PortfolioCheck<P>,
): { idx: number; key: PortfolioValidationKey } | null {
  for (let i = 0; i < limit; i++) {
    const p = portfolios[i];
    if (!p) continue;
    const key = check(p, i);
    if (key !== null) return { idx: i, key };
  }
  return null;
}

function buildChecks<P extends PortfolioLike>(
  emptyTickerMode: 'strict' | 'lenient',
  isWeightComplete: ((idx: number) => boolean) | undefined,
  passStrategy: 'single-pass' | 'two-pass',
): PortfolioCheck<P>[] {
  const tickerCheck: PortfolioCheck<P> = (p) =>
    hasTickerIssue(p, emptyTickerMode) ? 'emptyTicker' : null;
  const weightCheck: PortfolioCheck<P> = (_p, idx) =>
    hasWeightIssue(idx, isWeightComplete) ? 'weightMismatch' : null;
  if (passStrategy === 'two-pass') {
    return [tickerCheck, weightCheck];
  }
  const combined: PortfolioCheck<P> = (p, idx) => tickerCheck(p, idx) ?? weightCheck(p, idx);
  return [combined];
}

/**
 * Validate portfolios against empty-ticker and weight-sum rules.
 *
 * @param portfolios - Portfolios to validate.
 * @param options - Validation options; see {@link PortfolioValidationOptions}.
 * @returns First error message produced by `options.onError`, or null when all rules pass.
 */
export function validatePortfolioCore<P extends PortfolioLike>(
  portfolios: P[],
  options: PortfolioValidationOptions,
): string | null {
  const limit = options.limit ?? portfolios.length;
  const emptyTickerMode = options.emptyTickerMode ?? 'strict';
  const passStrategy = options.passStrategy ?? 'single-pass';
  const checks = buildChecks<P>(emptyTickerMode, options.isWeightComplete, passStrategy);
  for (const check of checks) {
    const failure = findFirstFailure(portfolios, limit, check);
    if (failure) {
      return options.onError(failure.idx, failure.key, totalWeightOf(portfolios[failure.idx]));
    }
  }
  return null;
}
