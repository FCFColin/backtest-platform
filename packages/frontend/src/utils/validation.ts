import i18n from '@/i18n/index.js';
export function validateAssetWeights(assets: { weight?: number }[]): string | null {
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return i18n.t('Weights must sum to 100%, got {{total}}%', { total: totalWeight.toFixed(2) });
  }
  return null;
}
type PortfolioValidationKey = 'emptyTicker' | 'weightMismatch';
interface PortfolioLike {
  assets: { ticker: string; weight: number }[];
}
interface PortfolioValidationOptions {
  limit?: number;
  emptyTickerMode?: 'strict' | 'lenient';
  isWeightComplete?: (idx: number) => boolean;
  passStrategy?: 'single-pass' | 'two-pass';
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
