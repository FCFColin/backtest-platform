import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { apiFetch } from './apiClient.js';
import { useAuthStore } from '@/store/authStore';
import { saveNamedConfig as lsSave, loadNamedConfigs as lsLoad, deleteNamedConfig as lsDelete, type SavedPortfolio } from './portfolioStorage.js';
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
    parameters: (r.config?.parameters ?? {}) as BacktestParameters
  };
}
export async function listNamedConfigs(): Promise<SavedPortfolio[]> {
  if (!isAuthed()) return lsLoad();
  try {
    const res = await apiFetch('/api/v1/configs');
    if (!res.ok) return lsLoad();
    const body = await res.json();
    return (body.data ?? []).map(toSavedPortfolio);
  } catch {
    return lsLoad();
  }
}
export async function saveNamedConfigApi(name: string, portfolios: Portfolio[], parameters: BacktestParameters): Promise<void> {
  if (!isAuthed()) {
    lsSave(name, portfolios, parameters);
    return;
  }
  await apiFetch('/api/v1/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config: { portfolios, parameters } })
  });
}
export async function deleteNamedConfigApi(id: string): Promise<void> {
  if (!isAuthed()) {
    lsDelete(id);
    return;
  }
  await apiFetch(`/api/v1/configs/${id}`, { method: 'DELETE' });
}
export async function importLocalConfigsOnce(): Promise<void> {
  if (!isAuthed()) return;
  try {
    if (localStorage.getItem(IMPORT_FLAG) === 'done') return;
    const local = lsLoad();
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
          config: { portfolios: c.portfolios, parameters: c.parameters }
        })
      });
    }
    localStorage.setItem(IMPORT_FLAG, 'done');
    // eslint-disable-next-line no-empty -- 导入标记写入失败，下次登录再尝试
  } catch {}
}
