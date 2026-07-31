import type { Portfolio, BacktestParameters } from '@backtest/shared';
export interface ShareableState {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
}
export function encodeState(state: ShareableState): string {
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeState(encoded: string): ShareableState | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.portfolios) || parsed.portfolios.length === 0) return null;
    if (!parsed.parameters || typeof parsed.parameters !== 'object') return null;
    for (const p of parsed.portfolios) {
      if (!Array.isArray(p.assets) || p.assets.length === 0) return null;
    }
    return parsed as ShareableState;
  } catch {
    return null;
  }
}
export function readStateFromURL(): ShareableState | null {
  const params = new URLSearchParams(window.location.search);
  const d = params.get('d');
  if (!d) return null;
  return decodeState(d);
}
export function writeStateToURL(state: ShareableState): string {
  const encoded = encodeState(state);
  const url = new URL(window.location.href);
  url.searchParams.set('d', encoded);
  window.history.replaceState({}, '', url.toString());
  return url.toString();
}
export function clearStateFromURL(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('d');
  window.history.replaceState({}, '', url.toString());
}
