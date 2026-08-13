import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { reportError } from './errorReporter.js';
import { apiFetch } from './apiClient.js';
import { useAuthStore } from '@/store/authStore';

export interface ShareableState {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
}

const b64Encode = (str: string) =>
  btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const b64Decode = (str: string) =>
  decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeState(state: ShareableState): string {
  return b64Encode(JSON.stringify(state));
}

export function decodeState(encoded: string): ShareableState | null {
  try {
    const parsed = JSON.parse(b64Decode(encoded));
    if (!Array.isArray(parsed.portfolios) || parsed.portfolios.length === 0) return null;
    if (!parsed.parameters || typeof parsed.parameters !== 'object') return null;
    if (
      parsed.portfolios.some(
        (p: { assets?: unknown[] }) => !Array.isArray(p.assets) || p.assets.length === 0,
      )
    )
      return null;
    return parsed as ShareableState;
  } catch {
    return null;
  }
}

export function readStateFromURL(): ShareableState | null {
  const d = new URLSearchParams(window.location.search).get('d');
  return d ? decodeState(d) : null;
}

export function writeStateToURL(state: ShareableState): string {
  const url = new URL(window.location.href);
  url.searchParams.set('d', encodeState(state));
  window.history.replaceState({}, '', url.toString());
  return url.toString();
}

function lsGet<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: `lsGet:${key}` });
    return fallback;
  }
}
function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: `lsSet:${key}` });
  }
}

export interface SavedPortfolio {
  id: string;
  name: string;
  savedAt: string;
  portfolios: Portfolio[];
  parameters: BacktestParameters;
}

const SAVED_KEY = 'backtest-saved-configs';

export function saveNamedConfig(
  name: string,
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): void {
  const configs = loadNamedConfigs();
  configs.push({
    id: `config-${Date.now()}`,
    name,
    savedAt: new Date().toISOString(),
    portfolios,
    parameters,
  });
  lsSet(SAVED_KEY, configs);
}

export const loadNamedConfigs = (): SavedPortfolio[] => lsGet<SavedPortfolio[]>(SAVED_KEY, []);

export function deleteNamedConfig(id: string): void {
  lsSet(
    SAVED_KEY,
    loadNamedConfigs().filter((c) => c.id !== id),
  );
}

const IMPORT_FLAG = 'bt_configs_imported';

function isAuthed(): boolean {
  const s = useAuthStore.getState();
  return !!s.user && !!s.user.tenantId;
}

interface ApiConfigRecord {
  id: string;
  name: string;
  config: { portfolios?: Portfolio[]; parameters?: BacktestParameters } | null;
  createdAt: string;
}

const toSavedPortfolio = (r: ApiConfigRecord): SavedPortfolio => ({
  id: r.id,
  name: r.name,
  savedAt: r.createdAt,
  portfolios: r.config?.portfolios ?? [],
  parameters: (r.config?.parameters ?? {}) as BacktestParameters,
});

export async function listNamedConfigs(): Promise<SavedPortfolio[]> {
  if (!isAuthed()) return loadNamedConfigs();
  try {
    const res = await apiFetch('/api/v1/configs');
    if (!res.ok) return loadNamedConfigs();
    const body = await res.json();
    return (body.data ?? []).map(toSavedPortfolio);
  } catch {
    return loadNamedConfigs();
  }
}

export async function saveNamedConfigApi(
  name: string,
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): Promise<void> {
  if (!isAuthed()) return saveNamedConfig(name, portfolios, parameters);
  await apiFetch('/api/v1/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config: { portfolios, parameters } }),
  });
}

export async function deleteNamedConfigApi(id: string): Promise<void> {
  if (!isAuthed()) return deleteNamedConfig(id);
  await apiFetch(`/api/v1/configs/${id}`, { method: 'DELETE' });
}

export async function importLocalConfigsOnce(): Promise<void> {
  if (!isAuthed()) return;
  try {
    if (localStorage.getItem(IMPORT_FLAG) === 'done') return;
    const local = loadNamedConfigs();
    if (local.length === 0) {
      localStorage.setItem(IMPORT_FLAG, 'done');
      return;
    }
    for (const c of local) {
      await apiFetch('/api/v1/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name,
          config: { portfolios: c.portfolios, parameters: c.parameters },
        }),
      });
    }
    localStorage.setItem(IMPORT_FLAG, 'done');
  } catch {}
}
