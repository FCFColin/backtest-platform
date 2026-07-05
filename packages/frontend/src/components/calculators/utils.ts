import type { CSSProperties } from 'react';
import type { TwoFundFrontierResult } from './types.js';

export function formatPct(v: number) {
  return (v * 100).toFixed(2) + '%';
}

export function formatNum(v: number) {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(2);
}

export function computeTwoFundFrontier(
  cagrA: number,
  volA: number,
  cagrB: number,
  volB: number,
  corr: number,
): TwoFundFrontierResult {
  const muA = cagrA / 100;
  const muB = cagrB / 100;
  const sA = volA / 100;
  const sB = volB / 100;
  const rho = corr;

  const pts: Array<{ wA: number; cagr: number; vol: number }> = [];
  for (let w = 0; w <= 100; w += 2) {
    const wA = w / 100;
    const wB = 1 - wA;
    const pCagr = wA * muA + wB * muB;
    const pVol = Math.sqrt(wA * wA * sA * sA + wB * wB * sB * sB + 2 * wA * wB * rho * sA * sB);
    pts.push({ wA, cagr: pCagr * 100, vol: pVol * 100 });
  }

  const covAB = rho * sA * sB;
  const denom = sA * sA + sB * sB - 2 * covAB;
  let mwA = denom !== 0 ? (sB * sB - covAB) / denom : 0.5;
  mwA = Math.max(0, Math.min(1, mwA));
  const mvCagr = (mwA * muA + (1 - mwA) * muB) * 100;
  const mvVol =
    Math.sqrt(mwA * mwA * sA * sA + (1 - mwA) * (1 - mwA) * sB * sB + 2 * mwA * (1 - mwA) * covAB) *
    100;

  return { frontier: pts, minVarW: mwA, minVarCagr: mvCagr, minVarVol: mvVol };
}

export const TOOLTIP_STYLE = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  fontSize: 12,
} as const;

export const INFO_BOX_STYLE: CSSProperties = {
  marginTop: 10,
  padding: '8px 12px',
  background: 'var(--bg-subtle)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-muted)',
};

export const COLLAPSIBLE_CARD_STYLE: CSSProperties = {
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--border-soft)',
  overflow: 'hidden',
};

export const ICON_BOX_STYLE: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: 'var(--brand-soft)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export const CARD_TITLE_STYLE: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: 0,
  flex: 1,
  textAlign: 'left',
};
