import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { reportError } from './errorReporter.js';
import { apiFetch } from './apiClient.js';
import { useAuthStore } from '@/store/authStore';
const STORAGE_KEY = 'backtest-portfolios';
const PARAMS_KEY = 'backtest-params';
export function savePortfolios(portfolios: Portfolio[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'savePortfolios' });
  }
}
export function loadPortfolios(): Portfolio[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as Portfolio[];
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'loadPortfolios' });
    return null;
  }
}
export function saveParameters(params: BacktestParameters): void {
  try {
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'saveParameters' });
  }
}
export function loadParameters(): BacktestParameters | null {
  try {
    const data = localStorage.getItem(PARAMS_KEY);
    if (!data) return null;
    return JSON.parse(data) as BacktestParameters;
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'loadParameters' });
    return null;
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
  const newConfig: SavedPortfolio = {
    id: `config-${Date.now()}`,
    name,
    savedAt: new Date().toISOString(),
    portfolios,
    parameters,
  };
  configs.push(newConfig);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(configs));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'saveNamedConfig' });
  }
}
export function loadNamedConfigs(): SavedPortfolio[] {
  try {
    const data = localStorage.getItem(SAVED_KEY);
    if (!data) return [];
    return JSON.parse(data) as SavedPortfolio[];
  } catch {
    return [];
  }
}
export function deleteNamedConfig(id: string): void {
  const configs = loadNamedConfigs();
  const filtered = configs.filter((c) => c.id !== id);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(filtered));
    // eslint-disable-next-line no-empty -- 存储空间满或不可用，静默忽略
  } catch {}
}
export function clearAllData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PARAMS_KEY);
    localStorage.removeItem(SAVED_KEY);
    // eslint-disable-next-line no-empty -- 存储不可用时无需处理
  } catch {}
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
function toSavedPortfolio(r: ApiConfigRecord): SavedPortfolio {
  return {
    id: r.id,
    name: r.name,
    savedAt: r.createdAt,
    portfolios: r.config?.portfolios ?? [],
    parameters: (r.config?.parameters ?? {}) as BacktestParameters,
  };
}
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
  if (!isAuthed()) {
    saveNamedConfig(name, portfolios, parameters);
    return;
  }
  await apiFetch('/api/v1/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config: { portfolios, parameters } }),
  });
}
export async function deleteNamedConfigApi(id: string): Promise<void> {
  if (!isAuthed()) {
    deleteNamedConfig(id);
    return;
  }
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
    // eslint-disable-next-line no-empty -- 导入标记写入失败，下次登录再尝试
  } catch {}
}
