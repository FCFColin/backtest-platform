export function validateAssetWeights(assets: { weight?: number }[]): string | null {
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return `Weights must sum to 100%, got ${totalWeight.toFixed(2)}%`;
  }
  return null;
}
